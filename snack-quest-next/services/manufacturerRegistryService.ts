import 'server-only';

import { manufacturerRepository, ManufacturerNotFoundError } from '@/repositories/manufacturerRepository';
import { machineModelRepository, MachineModelNotFoundError } from '@/repositories/machineModelRepository';
import { findAdapterRegistration, UnsupportedManufacturerError } from '@/lib/vending/adapterRegistry';
import { isHardwareCapability } from '@/lib/vending/protocol/capabilities';
import {
  CERTIFICATION_CHECKS,
  MANUFACTURER_ONBOARDING_STAGES,
  type CertificationCheckKey,
  type CertificationCheckResult,
  type IntegrationType,
  type Manufacturer,
  type ManufacturerOnboardingStage,
  type MachineModel,
} from '@/types';

export class RegistryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistryValidationError';
  }
}

export class IllegalOnboardingTransitionError extends Error {
  constructor(from: ManufacturerOnboardingStage, to: ManufacturerOnboardingStage, why: string) {
    super(`Cannot move manufacturer from "${from}" to "${to}": ${why}`);
    this.name = 'IllegalOnboardingTransitionError';
  }
}

export class CertificationIncompleteError extends Error {
  constructor(readonly outstanding: CertificationCheckKey[]) {
    super(`Certification incomplete — not yet passed: ${outstanding.join(', ')}`);
    this.name = 'CertificationIncompleteError';
  }
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug) || slug.length > 64) {
    throw new RegistryValidationError(`slug "${slug}" must be lowercase letters, digits and single hyphens (max 64 chars)`);
  }
}

function assertAdapterSupports(adapterKey: string, integrationType: IntegrationType): void {
  const registration = findAdapterRegistration(adapterKey);
  if (!registration) {
    throw new UnsupportedManufacturerError(adapterKey);
  }
  if (!registration.integrationTypes.includes(integrationType)) {
    throw new RegistryValidationError(
      `Adapter "${adapterKey}" does not support integration type "${integrationType}" (supports: ${registration.integrationTypes.join(', ')})`,
    );
  }
}

function assertCapabilities(capabilities: unknown): string[] {
  if (!Array.isArray(capabilities) || !capabilities.every(isHardwareCapability)) {
    throw new RegistryValidationError('declaredCapabilities must be an array of known capability keys');
  }
  return Array.from(new Set(capabilities));
}

/** Every check outstanding for certification — neither passed nor legitimately not applicable. Pure, exported for the admin UI and tests. */
export function outstandingCertificationChecks(checklist: MachineModel['certificationChecklist']): CertificationCheckKey[] {
  return CERTIFICATION_CHECKS.filter(({ key, mayBeNotApplicable }) => {
    const result = checklist[key];
    if (!result) {
      return true;
    }
    if (result.outcome === 'passed') {
      return false;
    }
    return !(result.outcome === 'not_applicable' && mayBeNotApplicable);
  }).map(({ key }) => key);
}

/**
 * The manufacturer and model registry (§ MANUFACTURER MODEL,
 * § MACHINE MODEL REGISTRY, § MANUFACTURER ONBOARDING, § MACHINE
 * CERTIFICATION). Staff-only — every caller is an admin route.
 *
 * The certification gate lives here: a model is `certified` only once
 * every required check has passed with recorded evidence, and any
 * change to what the model claims (capabilities, adapter) after that
 * revokes it — the certification described a different contract.
 */
class ManufacturerRegistryService {
  async createManufacturer(
    businessId: string,
    input: {
      name: string;
      slug: string;
      integrationType: IntegrationType;
      defaultAdapterKey: string;
      apiVersion?: string | null;
      documentationUrl?: string | null;
      supportContact?: string | null;
      notes?: string | null;
    },
    actor: string,
  ): Promise<string> {
    if (!input.name.trim()) {
      throw new RegistryValidationError('name is required');
    }
    assertSlug(input.slug);
    assertAdapterSupports(input.defaultAdapterKey, input.integrationType);
    if (await manufacturerRepository.findBySlug(businessId, input.slug)) {
      throw new RegistryValidationError(`A manufacturer with slug "${input.slug}" already exists`);
    }
    return manufacturerRepository.create({
      businessId,
      name: input.name.trim(),
      slug: input.slug,
      integrationType: input.integrationType,
      defaultAdapterKey: input.defaultAdapterKey,
      apiVersion: input.apiVersion ?? null,
      documentationUrl: input.documentationUrl ?? null,
      supportContact: input.supportContact ?? null,
      notes: input.notes ?? null,
      createdBy: actor,
    });
  }

  async updateManufacturer(
    businessId: string,
    manufacturerId: string,
    update: Partial<Pick<Manufacturer, 'name' | 'integrationType' | 'defaultAdapterKey' | 'apiVersion' | 'documentationUrl' | 'supportContact' | 'notes'>>,
    actor: string,
  ): Promise<void> {
    const manufacturer = await this.requireManufacturer(businessId, manufacturerId);
    if (update.integrationType || update.defaultAdapterKey) {
      assertAdapterSupports(update.defaultAdapterKey ?? manufacturer.defaultAdapterKey, update.integrationType ?? manufacturer.integrationType);
    }
    await manufacturerRepository.update(businessId, manufacturerId, update, actor);
  }

  /**
   * Onboarding moves forward exactly one stage at a time — no skipping
   * technical review on the way to production — and may move back to
   * any earlier stage. Entering `production` needs at least one
   * certified model; a suspended manufacturer cannot advance at all.
   */
  async moveToStage(businessId: string, manufacturerId: string, to: ManufacturerOnboardingStage, actor: string): Promise<void> {
    const manufacturer = await this.requireManufacturer(businessId, manufacturerId);
    const from = manufacturer.onboardingStage;
    const fromIndex = MANUFACTURER_ONBOARDING_STAGES.indexOf(from);
    const toIndex = MANUFACTURER_ONBOARDING_STAGES.indexOf(to);
    if (toIndex === -1) {
      throw new RegistryValidationError(`Unknown onboarding stage "${to}"`);
    }
    if (toIndex === fromIndex) {
      return;
    }
    if (toIndex > fromIndex) {
      if (manufacturer.status === 'suspended') {
        throw new IllegalOnboardingTransitionError(from, to, 'manufacturer is suspended');
      }
      if (toIndex !== fromIndex + 1) {
        throw new IllegalOnboardingTransitionError(from, to, 'stages advance one at a time');
      }
      if (to === 'production') {
        const models = await machineModelRepository.listByManufacturer(businessId, manufacturerId);
        if (!models.some(({ data }) => data.certificationStatus === 'certified')) {
          throw new IllegalOnboardingTransitionError(from, to, 'no machine model from this manufacturer is certified yet');
        }
      }
    }
    await manufacturerRepository.setStage(businessId, manufacturerId, to, actor);
  }

  async setManufacturerStatus(businessId: string, manufacturerId: string, status: Manufacturer['status'], actor: string): Promise<void> {
    await this.requireManufacturer(businessId, manufacturerId);
    await manufacturerRepository.setStatus(businessId, manufacturerId, status, actor);
  }

  async createModel(
    businessId: string,
    input: {
      manufacturerId: string;
      name: string;
      slug: string;
      adapterKey?: string | null;
      declaredCapabilities: unknown;
      slotCount?: number | null;
      slotIdFormat?: string | null;
      notes?: string | null;
    },
    actor: string,
  ): Promise<string> {
    const manufacturer = await this.requireManufacturer(businessId, input.manufacturerId);
    if (!input.name.trim()) {
      throw new RegistryValidationError('name is required');
    }
    assertSlug(input.slug);
    if (input.adapterKey) {
      assertAdapterSupports(input.adapterKey, manufacturer.integrationType);
    }
    const existing = await machineModelRepository.listByManufacturer(businessId, input.manufacturerId);
    if (existing.some(({ data }) => data.slug === input.slug)) {
      throw new RegistryValidationError(`${manufacturer.name} already has a model with slug "${input.slug}"`);
    }
    if (input.slotCount !== undefined && input.slotCount !== null && (!Number.isInteger(input.slotCount) || input.slotCount <= 0)) {
      throw new RegistryValidationError('slotCount must be a positive integer');
    }
    return machineModelRepository.create({
      businessId,
      manufacturerId: input.manufacturerId,
      name: input.name.trim(),
      slug: input.slug,
      adapterKey: input.adapterKey ?? null,
      declaredCapabilities: assertCapabilities(input.declaredCapabilities),
      slotCount: input.slotCount ?? null,
      slotIdFormat: input.slotIdFormat ?? null,
      notes: input.notes ?? null,
      createdBy: actor,
    });
  }

  async updateModel(
    businessId: string,
    modelId: string,
    update: { name?: string; adapterKey?: string | null; declaredCapabilities?: unknown; slotCount?: number | null; slotIdFormat?: string | null; notes?: string | null },
    actor: string,
  ): Promise<{ certificationRevoked: boolean }> {
    const model = await this.requireModel(businessId, modelId);
    const manufacturer = await this.requireManufacturer(businessId, model.manufacturerId);
    const next: Parameters<typeof machineModelRepository.update>[2] = {};
    if (update.name !== undefined) next.name = update.name.trim();
    if (update.slotCount !== undefined) next.slotCount = update.slotCount;
    if (update.slotIdFormat !== undefined) next.slotIdFormat = update.slotIdFormat;
    if (update.notes !== undefined) next.notes = update.notes;
    if (update.adapterKey !== undefined) {
      if (update.adapterKey) {
        assertAdapterSupports(update.adapterKey, manufacturer.integrationType);
      }
      next.adapterKey = update.adapterKey;
    }
    if (update.declaredCapabilities !== undefined) {
      next.declaredCapabilities = assertCapabilities(update.declaredCapabilities);
    }

    const contractChanged =
      (next.adapterKey !== undefined && next.adapterKey !== model.adapterKey) ||
      (next.declaredCapabilities !== undefined &&
        [...next.declaredCapabilities].sort().join() !== [...model.declaredCapabilities].sort().join());
    const certificationRevoked = contractChanged && model.certificationStatus === 'certified';
    if (certificationRevoked) {
      next.certificationStatus = 'revoked';
      next.revokedReason = 'Declared capabilities or adapter changed after certification — re-certify against the new contract.';
    }
    await machineModelRepository.update(businessId, modelId, next, actor);
    return { certificationRevoked };
  }

  /**
   * Records one checklist result. Evidence is mandatory — a check with
   * nothing behind it is an assertion, not a verification. A failed
   * check on a certified model revokes the certification.
   */
  async recordCertificationCheck(
    businessId: string,
    modelId: string,
    key: CertificationCheckKey,
    result: { outcome: CertificationCheckResult['outcome']; evidence: string },
    actor: string,
  ): Promise<void> {
    const model = await this.requireModel(businessId, modelId);
    const check = CERTIFICATION_CHECKS.find((entry) => entry.key === key);
    if (!check) {
      throw new RegistryValidationError(`Unknown certification check "${key}"`);
    }
    if (!['passed', 'failed', 'not_applicable'].includes(result.outcome)) {
      throw new RegistryValidationError('outcome must be passed, failed or not_applicable');
    }
    if (result.outcome === 'not_applicable' && !check.mayBeNotApplicable) {
      throw new RegistryValidationError(`"${check.label}" is required for every model and cannot be marked not applicable`);
    }
    if (!result.evidence.trim()) {
      throw new RegistryValidationError('evidence is required for every certification check');
    }
    const status =
      model.certificationStatus === 'certified' && result.outcome !== 'failed' ? 'certified' : 'in_progress';
    await machineModelRepository.recordCheck(
      businessId,
      modelId,
      key,
      { outcome: result.outcome, evidence: result.evidence.trim(), verifiedBy: actor },
      status,
    );
    if (model.certificationStatus === 'certified' && result.outcome === 'failed') {
      await machineModelRepository.update(businessId, modelId, { revokedReason: `Check "${check.label}" failed after certification.` }, actor);
    }
  }

  async certifyModel(businessId: string, modelId: string, actor: string): Promise<void> {
    const model = await this.requireModel(businessId, modelId);
    const outstanding = outstandingCertificationChecks(model.certificationChecklist);
    if (outstanding.length > 0) {
      throw new CertificationIncompleteError(outstanding);
    }
    await machineModelRepository.markCertified(businessId, modelId, actor);
  }

  async revokeCertification(businessId: string, modelId: string, reason: string, actor: string): Promise<void> {
    await this.requireModel(businessId, modelId);
    if (!reason.trim()) {
      throw new RegistryValidationError('A reason is required to revoke certification');
    }
    await machineModelRepository.update(businessId, modelId, { certificationStatus: 'revoked', revokedReason: reason.trim() }, actor);
  }

  async listManufacturers(businessId: string) {
    return manufacturerRepository.listByBusiness(businessId);
  }

  async listModels(businessId: string, manufacturerId?: string) {
    return manufacturerId
      ? machineModelRepository.listByManufacturer(businessId, manufacturerId)
      : machineModelRepository.listByBusiness(businessId);
  }

  async requireManufacturer(businessId: string, manufacturerId: string): Promise<Manufacturer> {
    const manufacturer = await manufacturerRepository.findById(businessId, manufacturerId);
    if (!manufacturer) {
      throw new ManufacturerNotFoundError(manufacturerId);
    }
    return manufacturer;
  }

  async requireModel(businessId: string, modelId: string): Promise<MachineModel> {
    const model = await machineModelRepository.findById(businessId, modelId);
    if (!model) {
      throw new MachineModelNotFoundError(modelId);
    }
    return model;
  }
}

export const manufacturerRegistryService = new ManufacturerRegistryService();
export { ManufacturerRegistryService, ManufacturerNotFoundError, MachineModelNotFoundError };
