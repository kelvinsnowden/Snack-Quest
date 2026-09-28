import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

/**
 * How a manufacturer's machines connect to Snack Quest.
 *
 * - `snack_quest_api` — the manufacturer builds against the Snack
 *   Quest Machine API (`/api/v1/machines/*`): their firmware or cloud
 *   calls us. Snack Quest publishes the spec; they implement it.
 * - `manufacturer_api` — Snack Quest calls the manufacturer's own
 *   HTTP API. Snack Quest writes the adapter.
 * - `sdk` — Snack Quest embeds the manufacturer's SDK in an adapter.
 * - `webhook` — the manufacturer pushes signed events to Snack Quest;
 *   commands (if any) go through another channel.
 * - `hybrid` — any combination of the above (typical: their API for
 *   commands, their webhooks for events).
 *
 * New integration methods are added here and in the adapter registry;
 * nothing in business logic branches on this value.
 */
export type IntegrationType = 'snack_quest_api' | 'manufacturer_api' | 'sdk' | 'webhook' | 'hybrid';

export const INTEGRATION_TYPES: readonly IntegrationType[] = ['snack_quest_api', 'manufacturer_api', 'sdk', 'webhook', 'hybrid'];

/** The commercial relationship, independent of onboarding progress — a manufacturer can be suspended at any stage. */
export type ManufacturerStatus = 'active' | 'suspended';

/**
 * Manufacturer → Integration Application → Technical Review →
 * Credentials → Test Environment → Certification → Production.
 * Advanced one stage at a time by `manufacturerRegistryService`; may
 * move back to any earlier stage (a failed certification returns to
 * sandbox). `production` additionally requires at least one certified
 * model.
 */
export type ManufacturerOnboardingStage =
  | 'application'
  | 'technical_review'
  | 'credentials'
  | 'sandbox'
  | 'certification'
  | 'production';

export const MANUFACTURER_ONBOARDING_STAGES: readonly ManufacturerOnboardingStage[] = [
  'application',
  'technical_review',
  'credentials',
  'sandbox',
  'certification',
  'production',
];

/**
 * `manufacturers/{manufacturerId}` — one hardware vendor Snack Quest
 * sources machines from. Admin-only (rules: tenant-admin read, no
 * client writes). Holds no secrets: integration credentials live in
 * `integrationCredentials`, encrypted.
 */
export interface Manufacturer extends AuditFields {
  businessId: string;
  name: string;
  /** Stable, URL-safe — used in the manufacturer webhook URL. Unique per business. */
  slug: string;
  integrationType: IntegrationType;
  /** Which registered adapter (`lib/vending/adapterRegistry.ts`) this manufacturer's machines use by default. A model or an individual machine's integration may override it. */
  defaultAdapterKey: string;
  status: ManufacturerStatus;
  onboardingStage: ManufacturerOnboardingStage;
  /** The Snack Quest Machine API version they integrate against (inbound), or the version of their API/SDK we integrate against (outbound). */
  apiVersion: string | null;
  documentationUrl: string | null;
  supportContact: string | null;
  notes: string | null;
  /** Timestamp each stage was entered — the onboarding audit trail at a glance. */
  stageHistory: { stage: ManufacturerOnboardingStage; at: Timestamp; by: string }[];
  /** Outcome of their authenticated webhook deliveries (throttled writes): feeds the webhook-failure alert. */
  webhookHealth?: { lastAcceptedAt?: Timestamp | null; lastRejectedAt?: Timestamp | null; lastRejectedCode?: string | null };
}

/** Every check a model must pass before it may run in production (§ MACHINE CERTIFICATION). */
export type CertificationCheckKey =
  | 'authentication'
  | 'machine_registration'
  | 'heartbeat'
  | 'status'
  | 'inventory'
  | 'product_mapping'
  | 'dispense_command'
  | 'dispense_confirmation'
  | 'failed_dispense'
  | 'idempotency'
  | 'error_handling'
  | 'webhooks'
  | 'payment_flow'
  | 'reconciliation'
  | 'contract_suite';

/**
 * `harnessOnly` checks cannot be recorded by hand: only a passing run of
 * the automated certification harness (`integrationCertificationService`)
 * records them, so no model is certified on manual checkboxes alone.
 */
export const CERTIFICATION_CHECKS: readonly { key: CertificationCheckKey; label: string; mayBeNotApplicable: boolean; harnessOnly?: boolean }[] = [
  { key: 'authentication', label: 'Authentication', mayBeNotApplicable: false },
  { key: 'machine_registration', label: 'Machine registration', mayBeNotApplicable: false },
  { key: 'heartbeat', label: 'Heartbeat', mayBeNotApplicable: false },
  { key: 'status', label: 'Status reporting', mayBeNotApplicable: false },
  { key: 'inventory', label: 'Inventory', mayBeNotApplicable: true },
  { key: 'product_mapping', label: 'Product / slot mapping', mayBeNotApplicable: false },
  { key: 'dispense_command', label: 'Dispense command', mayBeNotApplicable: false },
  { key: 'dispense_confirmation', label: 'Dispense confirmation', mayBeNotApplicable: false },
  { key: 'failed_dispense', label: 'Failed dispense', mayBeNotApplicable: false },
  { key: 'idempotency', label: 'Idempotency (duplicate commands and reports)', mayBeNotApplicable: false },
  { key: 'error_handling', label: 'Error handling', mayBeNotApplicable: false },
  { key: 'webhooks', label: 'Webhooks', mayBeNotApplicable: true },
  { key: 'payment_flow', label: 'Payment flow (paid → dispense → confirmed)', mayBeNotApplicable: false },
  { key: 'reconciliation', label: 'Reconciliation (timeouts, unknown outcomes)', mayBeNotApplicable: false },
  { key: 'contract_suite', label: 'Automated contract suite (harness run against this model)', mayBeNotApplicable: false, harnessOnly: true },
];

export interface CertificationCheckResult {
  outcome: 'passed' | 'failed' | 'not_applicable';
  /** What was observed — an event id, a test run, a transaction ref. Required: a check without evidence is an assertion, not a verification. */
  evidence: string;
  verifiedBy: string;
  verifiedAt: Timestamp;
}

export type ModelCertificationStatus = 'not_started' | 'in_progress' | 'certified' | 'revoked';

/**
 * `machineModels/{modelId}` — one hardware model from one
 * manufacturer. `declaredCapabilities` is what the physical hardware
 * has; what a machine can actually *do* is this intersected with its
 * adapter's own declaration (`effectiveCapabilities`).
 *
 * `certificationStatus === 'certified'` is the gate for activating a
 * production integration on a machine of this model. Changing
 * `declaredCapabilities` after certification revokes it — the
 * certification was for a different contract.
 */
export interface MachineModel extends AuditFields {
  businessId: string;
  manufacturerId: string;
  name: string;
  slug: string;
  /** Overrides the manufacturer's default adapter for this model, e.g. a newer controller board speaking a different protocol. */
  adapterKey: string | null;
  declaredCapabilities: string[];
  slotCount: number | null;
  /** Free-text description of the manufacturer's own slot naming (`spiral_01`, `A1`…) — documentation for whoever configures slot mappings. */
  slotIdFormat: string | null;
  certificationStatus: ModelCertificationStatus;
  certificationChecklist: Partial<Record<CertificationCheckKey, CertificationCheckResult>>;
  certifiedAt: Timestamp | null;
  certifiedBy: string | null;
  revokedReason: string | null;
  notes: string | null;
}
