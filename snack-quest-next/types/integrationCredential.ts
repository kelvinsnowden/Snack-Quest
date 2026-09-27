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
 * What a credential may speak for:
 * - `manufacturer` — the manufacturer's cloud, for every one of that
 *   manufacturer's machines in the credential's environment.
 * - `machine` — exactly one machine. What a manufacturer ships *on* a
 *   machine when each unit talks to Snack Quest directly, so one
 *   compromised unit can't impersonate the rest of the fleet.
 */
export type IntegrationCredentialScope =
  | { type: 'manufacturer' }
  | { type: 'machine'; machineId: string; machineCode: string };

/**
 * Lifecycle, derived — never stored — from the timestamps below
 * (`lib/vending/credentialLifecycle.ts`), so it can't disagree with them:
 *
 *   issued ──first use──▶ active ──rotate──▶ rotating ──grace ends──▶ expired
 *      │                    │                    │
 *      └────────────────────┴───── revoke ───────┴──────────────────▶ revoked
 *
 * `issued`, `active` and `rotating` authenticate; `expired` and
 * `revoked` never do.
 */
export type IntegrationCredentialStatus = 'issued' | 'active' | 'rotating' | 'expired' | 'revoked';

/**
 * `integrationCredentials/{keyId}` — a manufacturer's signing
 * credential (§ AUTHENTICATION).
 *
 * Scope is deliberately narrow: a credential authenticates as *its
 * manufacturer*, in *its environment* (and, if machine-scoped, for *its
 * machine* only). A sandbox key cannot touch a production machine, and
 * one manufacturer's key cannot touch another manufacturer's machine.
 *
 * Requests are HMAC-SHA256 signed, so the server needs the secret
 * itself, not a one-way hash: it is stored AES-256-GCM encrypted
 * (`lib/secrets/secretCipher.ts`), decrypted only in memory at
 * verification time, shown to the manufacturer exactly once at issue
 * (or rotation), and never returned by any API afterwards.
 *
 * Rotation never takes a fleet offline: `rotate` issues a successor and
 * leaves this key working until `graceEndsAt`, so a manufacturer can
 * roll the new secret out machine by machine and watch `lastUsedAt` on
 * the old one fall silent before it lapses.
 */
export interface IntegrationCredential {
  businessId: string;
  manufacturerId: string;
  kind: IntegrationCredentialKind;
  environment: MachineIntegrationEnvironment;
  /** Absent on credentials issued before scoping existed — read as `{ type: 'manufacturer' }`. */
  scope?: IntegrationCredentialScope;
  /** Public identifier, sent in `X-SQ-Key-Id`. Also the document id. */
  keyId: string;
  secretEncrypted: string;
  /** First 12 hex chars of SHA-256(secret) — lets a manufacturer confirm which secret they hold without revealing any of it. */
  secretFingerprint?: string;
  /** Legacy (pre-fingerprint) credentials only: the first characters of the secret. */
  secretPrefix?: string;
  label: string;
  issuedAt: Timestamp;
  issuedBy: string;
  /** Optional hard expiry — past it, the credential stops working even if never revoked. */
  expiresAt: Timestamp | null;
  revokedAt: Timestamp | null;
  revokedBy: string | null;
  revokedReason: string | null;
  /** Throttled: refreshed at most once a minute, so a busy fleet key isn't a hot document. */
  lastUsedAt: Timestamp | null;
  firstUsedAt?: Timestamp | null;
  /** Set when this key was rotated: its successor, when that happened, and when this key stops working. */
  supersededBy?: string | null;
  supersededAt?: Timestamp | null;
  graceEndsAt?: Timestamp | null;
  /** On a successor: the key it replaced. */
  rotatedFrom?: string | null;
  /** Optional per-credential override of the fleet-wide request budget (requests/minute). */
  rateLimitPerMinute?: number | null;
}

/** The one response that ever contains the secret. */
export interface IssuedIntegrationCredential {
  keyId: string;
  secret: string;
  kind: IntegrationCredentialKind;
  environment: MachineIntegrationEnvironment;
  scope: IntegrationCredentialScope;
  secretFingerprint: string;
  issuedAt: string;
  /** On a rotation: the key this one replaces, and when that key stops working. */
  rotatedFrom?: string;
  previousKeyGraceEndsAt?: string;
}
