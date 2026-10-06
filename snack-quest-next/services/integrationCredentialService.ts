import 'server-only';

import { manufacturerRepository, ManufacturerNotFoundError } from '@/repositories/manufacturerRepository';
import { integrationCredentialRepository, CredentialRotationConflictError } from '@/repositories/integrationCredentialRepository';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { invalidateCredentialCache } from '@/lib/vending/credentialCache';
import {
  DEFAULT_ROTATION_GRACE_HOURS,
  MAX_ROTATION_GRACE_HOURS,
  credentialStatus,
  scopeOf,
} from '@/lib/vending/credentialLifecycle';
import { isEncryptionConfigured } from '@/lib/secrets/secretCipher';
import { isProductionDeployment } from '@/lib/vending/deploymentEnvironment';
import {
  MANUFACTURER_ONBOARDING_STAGES,
  type IntegrationCredential,
  type IntegrationCredentialKind,
  type IntegrationCredentialScope,
  type IntegrationCredentialStatus,
  type IssuedIntegrationCredential,
  type MachineIntegrationEnvironment,
} from '@/types';

export class CredentialIssuanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialIssuanceError';
  }
}

export class IntegrationCredentialNotFoundError extends Error {
  constructor(keyId: string) {
    super(`Credential ${keyId} not found`);
    this.name = 'IntegrationCredentialNotFoundError';
  }
}

export { CredentialRotationConflictError };

/** A credential as the admin console may see it — everything except the secret, which is never readable after issue. */
export type IntegrationCredentialSummary = Omit<IntegrationCredential, 'secretEncrypted' | 'secretPrefix'> & {
  scope: IntegrationCredentialScope;
  status: IntegrationCredentialStatus;
  /** Fingerprint for new keys; the legacy 8-character prefix for keys issued before fingerprints existed. */
  secretHint: string;
};

/** `technical_review` → `Technical review`, as the onboarding stages are labelled on screen. */
function stageName(stage: string): string {
  const words = stage.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Issuing and revoking manufacturer credentials (§ AUTHENTICATION,
 * § MANUFACTURER ONBOARDING: "Credentials → Test Environment →
 * Certification → Production"). Sandbox keys become available at the
 * credentials stage; production keys only once the manufacturer has
 * reached production — so no manufacturer can talk to a live machine
 * before one of its models has been certified.
 */
class IntegrationCredentialService {
  async issue(
    businessId: string,
    manufacturerId: string,
    input: {
      kind: IntegrationCredentialKind;
      environment: MachineIntegrationEnvironment;
      label: string;
      expiresAt?: Date | null;
      /** Omit for a manufacturer-wide key. A machine id makes the key speak for that one machine only. */
      machineId?: string | null;
      rateLimitPerMinute?: number | null;
    },
    actor: string,
  ): Promise<IssuedIntegrationCredential> {
    const manufacturer = await manufacturerRepository.findById(businessId, manufacturerId);
    if (!manufacturer) {
      throw new ManufacturerNotFoundError(manufacturerId);
    }
    if (manufacturer.status !== 'active') {
      throw new CredentialIssuanceError(`${manufacturer.name} is suspended — no credentials can be issued`);
    }
    if (input.kind !== 'api' && input.kind !== 'webhook') {
      throw new CredentialIssuanceError('kind must be api or webhook');
    }
    const stageIndex = MANUFACTURER_ONBOARDING_STAGES.indexOf(manufacturer.onboardingStage);
    if (input.environment === 'sandbox' && stageIndex < MANUFACTURER_ONBOARDING_STAGES.indexOf('credentials')) {
      throw new CredentialIssuanceError(`Sandbox keys can be issued once ${manufacturer.name} reaches the Credentials stage. It is at ${stageName(manufacturer.onboardingStage)} — advance it under Onboarding first.`);
    }
    if (input.environment === 'production' && manufacturer.onboardingStage !== 'production') {
      throw new CredentialIssuanceError(`Production keys can be issued once ${manufacturer.name} reaches the Production stage, after its model is certified. It is at ${stageName(manufacturer.onboardingStage)}.`);
    }
    if (input.environment !== 'sandbox' && input.environment !== 'production') {
      throw new CredentialIssuanceError('environment must be sandbox or production');
    }
    if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) {
      throw new CredentialIssuanceError('expiresAt must be in the future');
    }
    // The signing secret is stored encrypted only when a key is
    // configured (secretCipher's dev fallback stores it as-is). That
    // fallback is fine for sandbox keys in local development, never for
    // a key that can reach live machines or any key minted on the
    // production deployment.
    if ((input.environment === 'production' || isProductionDeployment()) && !isEncryptionConfigured()) {
      throw new CredentialIssuanceError('SECRET_ENCRYPTION_KEY must be configured before production credentials can be issued');
    }
    let scope: IntegrationCredentialScope = { type: 'manufacturer' };
    if (input.machineId) {
      if (input.kind !== 'api') {
        throw new CredentialIssuanceError('Only api credentials can be scoped to a machine');
      }
      const integration = await machineIntegrationRepository.findByMachineId(businessId, input.machineId);
      if (!integration || integration.manufacturerId !== manufacturerId) {
        throw new CredentialIssuanceError('That machine is not integrated with this manufacturer');
      }
      if (integration.environment !== input.environment) {
        throw new CredentialIssuanceError(`That machine's integration is ${integration.environment}; a ${input.environment} key could never reach it`);
      }
      scope = { type: 'machine', machineId: integration.machineId, machineCode: integration.machineCode };
    }
    if (input.rateLimitPerMinute !== undefined && input.rateLimitPerMinute !== null && (!Number.isInteger(input.rateLimitPerMinute) || input.rateLimitPerMinute < 60 || input.rateLimitPerMinute > 1_000_000)) {
      throw new CredentialIssuanceError('rateLimitPerMinute must be a whole number between 60 and 1,000,000');
    }
    return integrationCredentialRepository.issue({
      businessId,
      manufacturerId,
      kind: input.kind,
      environment: input.environment,
      scope,
      label: input.label.trim() || `${input.kind} (${input.environment})`,
      issuedBy: actor,
      expiresAt: input.expiresAt ?? null,
      rateLimitPerMinute: input.rateLimitPerMinute ?? null,
    });
  }

  /**
   * Zero-downtime rotation: a successor is issued (its secret shown
   * once, now) and this key keeps working until the grace period ends,
   * so a manufacturer can move its fleet over gradually. Revoke the old
   * key early once its `lastUsedAt` shows nothing still uses it.
   */
  async rotate(businessId: string, keyId: string, options: { graceHours?: number }, actor: string): Promise<IssuedIntegrationCredential> {
    const graceHours = options.graceHours ?? DEFAULT_ROTATION_GRACE_HOURS;
    if (!Number.isFinite(graceHours) || graceHours < 0 || graceHours > MAX_ROTATION_GRACE_HOURS) {
      throw new CredentialIssuanceError(`graceHours must be between 0 and ${MAX_ROTATION_GRACE_HOURS}`);
    }
    const existing = await integrationCredentialRepository.findByKeyId(keyId);
    if (!existing || existing.businessId !== businessId) {
      throw new IntegrationCredentialNotFoundError(keyId);
    }
    const manufacturer = await manufacturerRepository.findById(businessId, existing.manufacturerId);
    if (!manufacturer || manufacturer.status !== 'active') {
      throw new CredentialIssuanceError('Credentials of a suspended manufacturer cannot be rotated');
    }
    if ((existing.environment === 'production' || isProductionDeployment()) && !isEncryptionConfigured()) {
      throw new CredentialIssuanceError('SECRET_ENCRYPTION_KEY must be configured before production credentials can be issued');
    }
    const issued = await integrationCredentialRepository.rotate(businessId, keyId, new Date(Date.now() + graceHours * 3_600_000), actor);
    invalidateCredentialCache(keyId);
    return issued;
  }

  async revoke(businessId: string, keyId: string, reason: string, actor: string): Promise<void> {
    if (!reason.trim()) {
      throw new CredentialIssuanceError('A reason is required to revoke a credential');
    }
    if (!(await integrationCredentialRepository.revoke(businessId, keyId, actor, reason.trim()))) {
      throw new IntegrationCredentialNotFoundError(keyId);
    }
    // Immediate on this instance; every other instance's cache entry lapses within its TTL (lib/vending/credentialCache.ts).
    invalidateCredentialCache(keyId);
  }

  async listForManufacturer(businessId: string, manufacturerId: string): Promise<IntegrationCredentialSummary[]> {
    const credentials = await integrationCredentialRepository.listByManufacturer(businessId, manufacturerId);
    const now = new Date();
    // An explicit field list, not a spread-and-delete: a field added to
    // the stored credential later is invisible here until someone
    // decides it is safe to show.
    return credentials.map((credential) => ({
      businessId: credential.businessId,
      manufacturerId: credential.manufacturerId,
      kind: credential.kind,
      environment: credential.environment,
      scope: scopeOf(credential),
      status: credentialStatus(credential, now),
      keyId: credential.keyId,
      secretFingerprint: credential.secretFingerprint,
      secretHint: credential.secretFingerprint ? `sha256:${credential.secretFingerprint}` : `${credential.secretPrefix ?? ''}…`,
      label: credential.label,
      issuedAt: credential.issuedAt,
      issuedBy: credential.issuedBy,
      expiresAt: credential.expiresAt,
      revokedAt: credential.revokedAt,
      revokedBy: credential.revokedBy,
      revokedReason: credential.revokedReason,
      lastUsedAt: credential.lastUsedAt,
      firstUsedAt: credential.firstUsedAt ?? null,
      supersededBy: credential.supersededBy ?? null,
      supersededAt: credential.supersededAt ?? null,
      graceEndsAt: credential.graceEndsAt ?? null,
      rotatedFrom: credential.rotatedFrom ?? null,
      rateLimitPerMinute: credential.rateLimitPerMinute ?? null,
    }));
  }
}

export const integrationCredentialService = new IntegrationCredentialService();
export { IntegrationCredentialService };
