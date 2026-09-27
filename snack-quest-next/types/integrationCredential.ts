import type { Timestamp } from 'firebase/firestore';
import type { MachineIntegrationEnvironment } from './machineIntegration';

/**
 * - `api` — signs requests to the Snack Quest Machine API (`/api/v1/machines/*`).
 * - `webhook` — signs webhook deliveries to `/api/v1/webhooks/manufacturers/{slug}`.
 * Kept separate so a leaked webhook key can't be used to drive the API,
 * and each can be rotated on its own schedule.
 */
export type IntegrationCredentialKind = 'api' | 'webhook';

/**
 * `integrationCredentials/{keyId}` — a manufacturer's signing
 * credential (§ AUTHENTICATION). One manufacturer holds any number;
 * rotation is issue-new, cut over, revoke-old, with both valid in
 * between.
 *
 * Scope is deliberately narrow: a credential authenticates as *its
 * manufacturer*, in *its environment* — it can only act on machines
 * whose integration names that manufacturer and that environment. A
 * sandbox key cannot touch a production machine, and one manufacturer's
 * key cannot touch another manufacturer's machine, even inside the
 * same Snack Quest fleet.
 *
 * Requests are HMAC-SHA256 signed, so the server needs the secret
 * itself, not a one-way hash: it is stored AES-256-GCM encrypted
 * (`lib/secrets/secretCipher.ts`), decrypted only in memory at
 * verification time, shown to the manufacturer exactly once at issue,
 * and never returned by any API afterwards.
 */
export interface IntegrationCredential {
  businessId: string;
  manufacturerId: string;
  kind: IntegrationCredentialKind;
  environment: MachineIntegrationEnvironment;
  /** Public identifier, sent in `X-SQ-Key-Id`. Also the document id. */
  keyId: string;
  secretEncrypted: string;
  /** First characters of the secret, in the clear — enough to tell credentials apart in a list, never enough to sign with. */
  secretPrefix: string;
  label: string;
  issuedAt: Timestamp;
  issuedBy: string;
  /** Optional hard expiry — past it, the credential stops working even if never revoked. */
  expiresAt: Timestamp | null;
  revokedAt: Timestamp | null;
  revokedBy: string | null;
  revokedReason: string | null;
  lastUsedAt: Timestamp | null;
}

/** The one response that ever contains the secret. */
export interface IssuedIntegrationCredential {
  keyId: string;
  secret: string;
  kind: IntegrationCredentialKind;
  environment: MachineIntegrationEnvironment;
  issuedAt: string;
}
