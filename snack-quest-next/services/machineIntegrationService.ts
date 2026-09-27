import 'server-only';

import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { manufacturerRepository, ManufacturerNotFoundError } from '@/repositories/manufacturerRepository';
import { machineModelRepository, MachineModelNotFoundError } from '@/repositories/machineModelRepository';
import { machineDispenseCommandRepository } from '@/repositories/machineDispenseCommandRepository';
import {
  machineIntegrationRepository,
  MachineIntegrationNotFoundError,
} from '@/repositories/machineIntegrationRepository';
import {
  defaultVendingAdapterResolver,
  findAdapterRegistration,
  UnsupportedManufacturerError,
  type VendingAdapterResolver,
} from '@/lib/vending/adapterRegistry';
import {
  ALL_HARDWARE_CAPABILITIES,
  classifyCapabilityStatus,
  effectiveCapabilities,
  NO_CAPABILITIES,
  type CapabilityStatus,
  type HardwareCapabilities,
  type HardwareCapability,
} from '@/lib/vending/protocol/capabilities';
import { ProtocolNotConfiguredError } from '@/lib/vending/hardwareAdapter';
import { deriveIntegrationHealth, type IntegrationHealth } from '@/lib/vending/integrationHealth';
import { isProductionDeployment } from '@/lib/vending/deploymentEnvironment';
import { livenessOfIntegration as livenessOf, type MachineLiveness } from '@/lib/vending/machineLiveness';
import {
  MACHINE_INTEGRATION_STATE_TRANSITIONS,
  type IntegrationErrorKind,
  type Machine,
  type MachineIntegration,
  type MachineIntegrationEnvironment,
  type MachineIntegrationState,
  type MachineModel,
  type Manufacturer,
} from '@/types';

/** A passing connection test older than this no longer counts toward activation. */
const CONNECTION_TEST_VALID_FOR_MS = 24 * 60 * 60 * 1000;

export class IntegrationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationConfigurationError';
  }
}

export class IntegrationActivationError extends Error {
  constructor(readonly reasons: string[]) {
    super(`Integration cannot be activated: ${reasons.join('; ')}`);
    this.name = 'IntegrationActivationError';
  }
}

export class IllegalIntegrationStateTransitionError extends Error {
  constructor(from: MachineIntegrationState, to: MachineIntegrationState) {
    super(`Cannot move integration from "${from}" to "${to}"`);
    this.name = 'IllegalIntegrationStateTransitionError';
  }
}

export type DispenseGate = { allowed: true; integrated: boolean } | { allowed: false; reason: string };

export interface MachineIntegrationView {
  integration: MachineIntegration | null;
  manufacturer: { id: string; name: string; slug: string; onboardingStage: Manufacturer['onboardingStage']; status: Manufacturer['status'] } | null;
  model: { id: string; name: string; certificationStatus: MachineModel['certificationStatus'] } | null;
  adapter: { key: string; label: string; direction: string; environment: string; maturity: string } | null;
  health: IntegrationHealth | null;
  /** Is the machine itself reachable and able to take orders right now (distinct from integration health). */
  liveness: MachineLiveness | null;
  capabilities: { capability: HardwareCapability; status: CapabilityStatus }[];
  activationBlockers: string[];
}

/** How long a failed connection to an outbound manufacturer API stops new orders (see `dispenseGate`). */
export const OUTBOUND_BREAKER_MS = 2 * 60_000;

/**
 * CONFIGURE → TEST → ACTIVATE for one machine's integration
 * (§ ADMIN CONSOLE, § INTEGRATION HEALTH), and the single answer to
 * "may this machine be told to dispense right now?" (`dispenseGate`).
 *
 * Nothing becomes live because configuration exists: `tested` needs a
 * passing connection test, `active` needs a recent passing test plus —
 * for a production integration — a certified model from a manufacturer
 * in the production onboarding stage, on a production-capable adapter.
 * Sandbox integrations can never be activated in a production
 * deployment at all.
 */
class MachineIntegrationService {
  constructor(private readonly resolveAdapter: VendingAdapterResolver = defaultVendingAdapterResolver) {}

  async configure(
    businessId: string,
    input: {
      machineId: string;
      manufacturerId: string;
      modelId: string;
      manufacturerMachineId: string;
      adapterKey?: string | null;
      controllerType?: string | null;
      controllerVersion?: string | null;
      firmwareVersion?: string | null;
      integrationVersion?: string | null;
      environment: MachineIntegrationEnvironment;
    },
    actor: string,
  ): Promise<void> {
    const machine = await this.requireMachine(businessId, input.machineId);
    const manufacturer = await manufacturerRepository.findById(businessId, input.manufacturerId);
    if (!manufacturer) {
      throw new ManufacturerNotFoundError(input.manufacturerId);
    }
    const model = await machineModelRepository.findById(businessId, input.modelId);
    if (!model) {
      throw new MachineModelNotFoundError(input.modelId);
    }
    if (model.manufacturerId !== input.manufacturerId) {
      throw new IntegrationConfigurationError(`Model ${model.name} does not belong to ${manufacturer.name}`);
    }
    if (!input.manufacturerMachineId.trim()) {
      throw new IntegrationConfigurationError('manufacturerMachineId is required — it is how the manufacturer identifies this unit');
    }
    if (input.environment !== 'sandbox' && input.environment !== 'production') {
      throw new IntegrationConfigurationError('environment must be sandbox or production');
    }
    const adapterKey = input.adapterKey || model.adapterKey || manufacturer.defaultAdapterKey;
    const registration = findAdapterRegistration(adapterKey);
    if (!registration) {
      throw new UnsupportedManufacturerError(adapterKey);
    }
    if (!registration.integrationTypes.includes(manufacturer.integrationType)) {
      throw new IntegrationConfigurationError(`Adapter "${adapterKey}" does not support ${manufacturer.name}'s integration type "${manufacturer.integrationType}"`);
    }
    if (input.environment === 'production' && registration.environment === 'sandbox_only') {
      throw new IntegrationConfigurationError(`Adapter "${adapterKey}" is sandbox-only and cannot back a production integration`);
    }

    const current = await machineIntegrationRepository.findByMachineId(businessId, input.machineId);
    if (current && (current.manufacturerId !== input.manufacturerId || current.manufacturerMachineId !== input.manufacturerMachineId.trim())) {
      // Re-pointing a machine at another manufacturer (or unit) while a
      // dispense is in flight would hand that dispense's outcome to an
      // integration that never sent it. Let it finish or expire first.
      const inFlight = await machineDispenseCommandRepository.listForMachineInStatuses(businessId, input.machineId, ['requested', 'authorized', 'sent', 'acknowledged', 'dispensing']);
      if (inFlight.length > 0) {
        throw new IntegrationConfigurationError(`${inFlight.length} dispense(s) are still in flight on this machine (${inFlight.map((c) => c.commandRef).join(', ')}); wait for them to finish or expire before changing its manufacturer`);
      }
    }

    await machineIntegrationRepository.configure(
      {
        businessId,
        machineId: input.machineId,
        machineCode: machine.machineCode,
        manufacturerId: input.manufacturerId,
        modelId: input.modelId,
        manufacturerMachineId: input.manufacturerMachineId.trim(),
        controllerType: input.controllerType ?? null,
        controllerVersion: input.controllerVersion ?? null,
        firmwareVersion: input.firmwareVersion ?? machine.firmwareVersion ?? null,
        integrationType: manufacturer.integrationType,
        integrationVersion: input.integrationVersion ?? manufacturer.apiVersion ?? null,
        adapterKey,
        environment: input.environment,
      },
      actor,
    );
  }

  /**
   * Runs the adapter's own connection test and records the result.
   * A pass moves `configured` → `tested`; a failure moves `tested` back
   * to `configured`. An `active` integration stays active on a failed
   * test — the health state shows the problem; suspending is a human
   * decision, not something a single probe should do to live sales.
   */
  async testConnection(businessId: string, machineId: string, actor: string): Promise<{ ok: boolean; detail: string; latencyMs: number | null }> {
    const integration = await this.requireIntegration(businessId, machineId);
    const adapter = this.resolveAdapter(integration.adapterKey);
    const startedAt = Date.now();
    let result: { ok: boolean; detail: string; latencyMs: number | null; errorKind: IntegrationErrorKind | null };
    try {
      result = await adapter.testConnection(machineId);
    } catch (error) {
      // The contract says testConnection doesn't throw; an adapter that
      // does anyway is itself a protocol failure worth recording, not a
      // 500 for the admin.
      result = {
        ok: false,
        detail: error instanceof Error ? error.message : 'connection test threw',
        latencyMs: Date.now() - startedAt,
        errorKind: 'protocol',
      };
    }

    await machineIntegrationRepository.recordConnectionTest(businessId, machineId, { ok: result.ok, detail: result.detail, latencyMs: result.latencyMs }, actor);
    if (result.ok) {
      await machineIntegrationRepository.recordSignal(machineId, 'api_request');
      if (integration.state === 'configured') {
        await machineIntegrationRepository.setState(businessId, machineId, 'tested', actor);
      }
    } else {
      await machineIntegrationRepository.recordError(machineId, result.errorKind ?? 'connection', result.detail);
      if (integration.state === 'tested') {
        await machineIntegrationRepository.setState(businessId, machineId, 'configured', actor);
      }
    }
    return { ok: result.ok, detail: result.detail, latencyMs: result.latencyMs };
  }

  async activate(businessId: string, machineId: string, actor: string): Promise<void> {
    const integration = await this.requireIntegration(businessId, machineId);
    if (!MACHINE_INTEGRATION_STATE_TRANSITIONS[integration.state].includes('active')) {
      throw new IllegalIntegrationStateTransitionError(integration.state, 'active');
    }
    const blockers = await this.activationBlockers(businessId, integration);
    if (blockers.length > 0) {
      throw new IntegrationActivationError(blockers);
    }
    await machineIntegrationRepository.setState(businessId, machineId, 'active', actor);
  }

  async suspend(businessId: string, machineId: string, reason: string, actor: string): Promise<void> {
    const integration = await this.requireIntegration(businessId, machineId);
    if (!MACHINE_INTEGRATION_STATE_TRANSITIONS[integration.state].includes('suspended')) {
      throw new IllegalIntegrationStateTransitionError(integration.state, 'suspended');
    }
    if (!reason.trim()) {
      throw new IntegrationConfigurationError('A reason is required to suspend an integration');
    }
    await machineIntegrationRepository.setState(businessId, machineId, 'suspended', actor, { suspendedReason: reason.trim() });
  }

  /** Every reason activation would be refused right now — the admin UI shows these before anyone presses the button. */
  async activationBlockers(businessId: string, integration: MachineIntegration): Promise<string[]> {
    const blockers: string[] = [];
    const registration = findAdapterRegistration(integration.adapterKey);
    const [manufacturer, model] = await Promise.all([
      manufacturerRepository.findById(businessId, integration.manufacturerId),
      machineModelRepository.findById(businessId, integration.modelId),
    ]);

    const test = integration.lastConnectionTest;
    if (!test || !test.ok) {
      blockers.push('No passing connection test');
    } else if (Date.now() - test.at.toMillis() > CONNECTION_TEST_VALID_FOR_MS) {
      blockers.push('Last passing connection test is more than 24 hours old — test again');
    }
    if (!registration) {
      blockers.push(`Adapter "${integration.adapterKey}" is no longer registered`);
    }
    if (!manufacturer) {
      blockers.push('Manufacturer record is missing');
    } else if (manufacturer.status === 'suspended') {
      blockers.push(`${manufacturer.name} is suspended`);
    }
    if (isProductionDeployment() && (integration.environment === 'sandbox' || registration?.environment === 'sandbox_only')) {
      blockers.push('Sandbox integrations cannot be activated on the production deployment');
    }
    if (integration.environment === 'production') {
      if (!model || model.certificationStatus !== 'certified') {
        blockers.push(`Model ${model?.name ?? integration.modelId} is not certified for production`);
      }
      if (manufacturer && manufacturer.onboardingStage !== 'production') {
        blockers.push(`${manufacturer.name} has not reached the production onboarding stage (currently ${manufacturer.onboardingStage})`);
      }
      if (registration && registration.maturity !== 'implemented') {
        blockers.push(`Adapter "${registration.key}" is a ${registration.maturity}, not a tested implementation`);
      }
    }
    return blockers;
  }

  /**
   * The gate every dispense passes through (`dispenseCommandService`).
   * A machine with no integration record is a pre-registry machine and
   * keeps working exactly as before; any machine that *has* joined the
   * registry must be active, from an active manufacturer, and — on the
   * production deployment — a production integration.
   */
  async dispenseGate(businessId: string, machineId: string, purpose: 'dispatch' | 'pre_payment' = 'dispatch'): Promise<DispenseGate> {
    const integration = await machineIntegrationRepository.findByMachineId(businessId, machineId);
    if (!integration) {
      return { allowed: true, integrated: false };
    }
    if (integration.state !== 'active') {
      return { allowed: false, reason: `machine integration is ${integration.state}, not active` };
    }
    if (integration.maintenanceUntil && integration.maintenanceUntil.toMillis() > Date.now()) {
      return { allowed: false, reason: `machine is in maintenance${integration.maintenanceReason ? `: ${integration.maintenanceReason}` : ''}` };
    }
    if (purpose === 'pre_payment' && findAdapterRegistration(integration.adapterKey)?.direction === 'inbound') {
      // An inbound machine collects its dispense by polling; don't take
      // money for one that couldn't collect it within the command's life.
      const liveness = livenessOf(integration);
      if (!liveness.canAcceptOrders) {
        return { allowed: false, reason: `machine is not reachable (${liveness.state.toLowerCase()}: ${liveness.reason.replace(/_/g, ' ')})` };
      }
    }
    if (purpose === 'pre_payment' && findAdapterRegistration(integration.adapterKey)?.direction === 'outbound') {
      // A short circuit breaker: if the last call to the manufacturer's
      // API failed to connect (or timed out) within the last couple of
      // minutes and nothing has succeeded since, don't take the next
      // customer's money only to refund it. After the window one order
      // is let through as the probe; its success closes the breaker.
      const error = integration.lastError;
      const lastOk = integration.signals?.api_request?.toMillis() ?? 0;
      if (error && (error.kind === 'connection' || error.kind === 'timeout') && error.at && Date.now() - error.at.toMillis() < OUTBOUND_BREAKER_MS && error.at.toMillis() > lastOk) {
        return { allowed: false, reason: `manufacturer API unreachable (${error.kind}); retrying automatically` };
      }
    }
    if (isProductionDeployment() && integration.environment !== 'production') {
      return { allowed: false, reason: 'sandbox integration on the production deployment' };
    }
    const manufacturer = await manufacturerRepository.findById(businessId, integration.manufacturerId);
    if (!manufacturer || manufacturer.status !== 'active') {
      return { allowed: false, reason: 'manufacturer is suspended' };
    }
    return { allowed: true, integrated: true };
  }

  /** What this machine can actually do — model declaration ∩ adapter declaration — classified four ways for the UI. */
  async capabilitiesFor(businessId: string, machine: Machine): Promise<{ capabilities: HardwareCapabilities; statuses: { capability: HardwareCapability; status: CapabilityStatus }[] }> {
    const model = machine.modelId ? await machineModelRepository.findById(businessId, machine.modelId) : null;
    let adapterCapabilities: HardwareCapabilities = NO_CAPABILITIES;
    let registered = true;
    let protocolConfigured = true;
    try {
      const adapter = this.resolveAdapter(machine.manufacturer);
      adapterCapabilities = adapter.capabilities();
      protocolConfigured = findAdapterRegistration(machine.manufacturer)?.maturity !== 'stub';
    } catch (error) {
      if (!(error instanceof UnsupportedManufacturerError || error instanceof ProtocolNotConfiguredError)) {
        throw error;
      }
      registered = false;
    }
    const capabilities = effectiveCapabilities(adapterCapabilities, model ? (model.declaredCapabilities as HardwareCapability[]) : null);
    return {
      capabilities,
      statuses: ALL_HARDWARE_CAPABILITIES.map((capability) => ({
        capability,
        status: classifyCapabilityStatus(capability, { registered, protocolConfigured, capabilities }),
      })),
    };
  }

  /** Everything the admin machine page's Integration card shows. Admin-only — never serialized for an owner. */
  async getView(businessId: string, machineId: string): Promise<MachineIntegrationView> {
    const machine = await this.requireMachine(businessId, machineId);
    const integration = await machineIntegrationRepository.findByMachineId(businessId, machineId);
    const { statuses } = await this.capabilitiesFor(businessId, machine);
    if (!integration) {
      return { integration: null, manufacturer: null, model: null, adapter: null, health: null, liveness: null, capabilities: statuses, activationBlockers: [] };
    }
    const [manufacturer, model] = await Promise.all([
      manufacturerRepository.findById(businessId, integration.manufacturerId),
      machineModelRepository.findById(businessId, integration.modelId),
    ]);
    const registration = findAdapterRegistration(integration.adapterKey);
    return {
      integration,
      manufacturer: manufacturer
        ? { id: integration.manufacturerId, name: manufacturer.name, slug: manufacturer.slug, onboardingStage: manufacturer.onboardingStage, status: manufacturer.status }
        : null,
      model: model ? { id: integration.modelId, name: model.name, certificationStatus: model.certificationStatus } : null,
      adapter: registration
        ? { key: registration.key, label: registration.label, direction: registration.direction, environment: registration.environment, maturity: registration.maturity }
        : null,
      health: deriveIntegrationHealth(integration),
      liveness: livenessOf(integration),
      capabilities: statuses,
      activationBlockers: integration.state === 'active' ? [] : await this.activationBlockers(businessId, integration),
    };
  }

  /** The cron's health probe: re-tests every active outbound integration so health reflects reality even with no traffic. Inbound machines report their own heartbeats. */
  async probeActiveOutboundIntegrations(businessId: string): Promise<{ probed: number; failed: number }> {
    const integrations = await machineIntegrationRepository.listByBusiness(businessId);
    let probed = 0;
    let failed = 0;
    for (const integration of integrations) {
      if (integration.state !== 'active' || findAdapterRegistration(integration.adapterKey)?.direction !== 'outbound') {
        continue;
      }
      probed += 1;
      const result = await this.testConnection(businessId, integration.machineId, 'system:integration-probe');
      if (!result.ok) {
        failed += 1;
      }
    }
    return { probed, failed };
  }

  async listIntegrations(businessId: string): Promise<{ integration: MachineIntegration; health: IntegrationHealth }[]> {
    const integrations = await machineIntegrationRepository.listByBusiness(businessId);
    return integrations.map((integration) => ({ integration, health: deriveIntegrationHealth(integration) }));
  }

  async requireIntegration(businessId: string, machineId: string): Promise<MachineIntegration> {
    const integration = await machineIntegrationRepository.findByMachineId(businessId, machineId);
    if (!integration) {
      throw new MachineIntegrationNotFoundError(machineId);
    }
    return integration;
  }

  private async requireMachine(businessId: string, machineId: string): Promise<Machine> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) {
      throw new MachineNotFoundError(machineId);
    }
    return machine;
  }
}

export const machineIntegrationService = new MachineIntegrationService();
export { MachineIntegrationService, MachineIntegrationNotFoundError };
