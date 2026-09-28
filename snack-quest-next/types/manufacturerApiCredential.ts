import type { Timestamp } from 'firebase/firestore';
import type { MachineIntegrationEnvironment } from './machineIntegration';

/** One stored version of Snack Quest's key for a manufacturer's API. The secret is AES-256-GCM encrypted; only its fingerprint is ever shown. */
export interface ManufacturerApiCredentialVersion {
  version: number;
  secretEncrypted: string;
  /** sha256(secret)[:12] — lets staff confirm which key is loaded without seeing it. */
  fingerprint: string;
  setAt: Timestamp;
  setBy: string;
}

/**
 * `manufacturerApiCredentials/{manufacturerId}__{environment}` — the
 * credential Snack Quest uses to call one manufacturer's API (Model A),
 * in one environment. Replaces the global
 * `REFERENCE_MANUFACTURER_API_URL`/`_KEY` environment variables: every
 * outbound manufacturer and environment has its own, set through the
 * admin console, audited, rotatable and revocable.
 *
 * Server-only: Firestore rules deny all client access, and no API
 * returns `secretEncrypted`.
 */
export interface ManufacturerApiCredential {
  businessId: string;
  manufacturerId: string;
  environment: MachineIntegrationEnvironment;
  /** Validated: https, no embedded credentials, not a private/loopback/link-local address (lib/vending/outboundUrl.ts). */
  baseUrl: string;
  status: 'active' | 'revoked';
  current: ManufacturerApiCredentialVersion | null;
  /** The version replaced by the last rotation — kept so a bad rotation can be rolled back. Deleted on revocation. */
  previous: (ManufacturerApiCredentialVersion & { retiredAt: Timestamp }) | null;
  revokedAt: Timestamp | null;
  revokedBy: string | null;
  revokedReason: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  updatedBy: string;
}
