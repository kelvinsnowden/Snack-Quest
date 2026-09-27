import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';
import type { IntegrationType } from './manufacturer';

/**
 * CONFIGURE → TEST → ACTIVATE. Configuration existing is never enough
 * to go live: `tested` needs a passing connection test, and `active`
 * additionally needs (for a production integration) a certified model
 * and a production-capable adapter. `suspended` stops dispensing
 * without deleting anything; re-activation re-runs the same gates.
 */
export type MachineIntegrationState = 'configured' | 'tested' | 'active' | 'suspended';

/**
 * `sandbox` integrations exist for development, staging and
 * manufacturer certification runs. They can never be activated in a
 * production deployment — see `machineIntegrationService.activate`.
 */
export type MachineIntegrationEnvironment = 'sandbox' | 'production';

/** Derived at read time from the signals below (`deriveIntegrationHealth`), never stored — same discipline as machine connectivity. */
export type IntegrationHealthState = 'connected' | 'degraded' | 'disconnected' | 'error';

export type IntegrationErrorKind = 'connection' | 'authentication' | 'timeout' | 'protocol';

export type IntegrationSignalKind = 'heartbeat' | 'api_request' | 'dispense_success' | 'inventory_sync' | 'webhook';

/**
 * `machineIntegrations/{machineId}` — how one machine is wired to
 * Snack Quest: which manufacturer/model it is, its manufacturer-side
 * identity, which adapter speaks for it, where it is in the
 * CONFIGURE → TEST → ACTIVATE lifecycle, and its integration health.
 *
 * Deliberately separate from `machines/{machineId}`: the machine
 * document is readable by the owning partner (firestore.rules), and an
 * owner never needs — and should never see — controller types, adapter
 * keys, protocol versions or error counters. This collection is
 * tenant-admin-read only.
 *
 * A machine with no document here is a pre-registry machine: it keeps
 * running through `Machine.manufacturer` exactly as before. Configuring
 * an integration is how it joins the registry, and from then on its
 * dispensing is gated on this document's `state`.
 */
export interface MachineIntegration extends AuditFields {
  businessId: string;
  machineId: string;
  /** Snack Quest's own identity (`SQ-MCH-000001`) — denormalized so the v1 API and webhooks can resolve a machine without exposing Firestore ids. */
  machineCode: string;
  manufacturerId: string;
  modelId: string;
  /** The manufacturer's own identifier for this unit (their device id / serial in their cloud). Unique per manufacturer. Metadata, never the primary key. */
  manufacturerMachineId: string;
  controllerType: string | null;
  controllerVersion: string | null;
  firmwareVersion: string | null;
  integrationType: IntegrationType;
  /** The version of the contract spoken — the Snack Quest Machine API version (inbound) or the manufacturer API/SDK version (outbound). */
  integrationVersion: string | null;
  adapterKey: string;
  environment: MachineIntegrationEnvironment;
  state: MachineIntegrationState;
  lastConnectionTest: { at: Timestamp; ok: boolean; detail: string; latencyMs: number | null } | null;
  activatedAt: Timestamp | null;
  activatedBy: string | null;
  suspendedAt: Timestamp | null;
  suspendedReason: string | null;
  signals: Record<IntegrationSignalKind, Timestamp | null>;
  /** Cumulative since configuration — the trend is read from `machineEvents`; these are the at-a-glance totals. */
  errorCounts: Record<IntegrationErrorKind, number>;
  lastError: { kind: IntegrationErrorKind; message: string; at: Timestamp } | null;
  /** The last full status the machine itself reported through the v1 API — what an inbound-only adapter answers `getMachineStatus` from, since Snack Quest cannot call that machine. */
  lastReportedStatus: {
    online: boolean;
    doorOpen: boolean | null;
    temperatureCelsius: number | null;
    faults: string[];
    paymentDeviceOk: boolean | null;
    reportedAt: Timestamp;
  } | null;
}

export const MACHINE_INTEGRATION_STATE_TRANSITIONS: Record<MachineIntegrationState, MachineIntegrationState[]> = {
  configured: ['tested', 'suspended'],
  // A reconfiguration drops back to `configured`; a failed re-test does too.
  tested: ['active', 'configured', 'suspended'],
  active: ['suspended', 'configured'],
  suspended: ['configured'],
};
