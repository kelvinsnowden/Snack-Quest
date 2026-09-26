import type { Timestamp } from 'firebase/firestore';

/**
 * `deviceCredentials/{credentialId}` — a machine's own identity and
 * secret, deliberately separate from `users`/`staffProfiles`
 * (§ DEVICE SECURITY, § "do not authenticate machines as normal
 * users").
 *
 * A machine is not a person and does not get a Firebase Auth account,
 * a session cookie, or a role. It gets exactly one thing: a bearer
 * secret scoped to exactly one `machineId`, presented on every call to
 * a device-facing route and checked in
 * `lib/vending/deviceAuth.ts:authenticateDevice()`.
 *
 * **The secret itself is never stored.** `secretHash` is a SHA-256
 * digest — the same one-way hashing this codebase already uses for
 * `investorInterestService`'s rate-limit key — so a leaked Firestore
 * export cannot be turned back into a working credential. The secret
 * is shown to whoever provisions the device exactly once, at
 * `machineService.provisionDevice()` time, in the API response and
 * nowhere else; it cannot be retrieved again, only rotated.
 *
 * `revokedAt` is the whole answer to "what happens when a device is
 * compromised": set it, and `authenticateDevice()` starts rejecting
 * that credential immediately, without deleting the audit trail of
 * which machine it was ever bound to. Rotation is revoke-and-reissue,
 * not an in-place secret change — a credential's lifetime is a fact
 * worth keeping, not something to overwrite.
 */
export interface DeviceCredential {
  businessId: string;
  machineId: string;
  /** SHA-256 hex digest of the secret — never the secret itself. */
  secretHash: string;
  /** The prefix of the secret (first 8 chars), stored in the clear — enough to show "which credential is this" in an audit list without the digest, never enough to authenticate with. */
  secretPrefix: string;
  issuedAt: Timestamp;
  issuedBy: string;
  /** Null while active. Set by `machineService.revokeDeviceCredential()` — immediately effective, never a soft grace period. */
  revokedAt: Timestamp | null;
  revokedBy: string | null;
  revokedReason: string | null;
  lastUsedAt: Timestamp | null;
}

/** The one-time response shape when a credential is issued — the only place the plaintext secret ever appears. */
export interface IssuedDeviceCredential {
  credentialId: string;
  machineId: string;
  /** Shown exactly once. The caller must store this; Snack Quest does not keep a retrievable copy. */
  secret: string;
  issuedAt: string;
}
