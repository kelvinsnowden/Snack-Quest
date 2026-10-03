import { createHash } from 'node:crypto';
import type { IntegrationCredential, IntegrationCredentialScope, IntegrationCredentialStatus } from '@/types';

/** Default overlap after a rotation: long enough to roll a new secret across a fleet, short enough that a leaked key doesn't linger. */
export const DEFAULT_ROTATION_GRACE_HOURS = 7 * 24;
export const MAX_ROTATION_GRACE_HOURS = 30 * 24;
/** `lastUsedAt` is refreshed at most this often per credential — bookkeeping must never make a fleet key a hot document. */
export const LAST_USED_WRITE_INTERVAL_MS = 60_000;

type Millis = { toMillis(): number };

function ms(value: Millis | null | undefined): number | null {
  return value ? value.toMillis() : null;
}

/** Status is derived, never stored (see `IntegrationCredentialStatus`). */
export function credentialStatus(
  credential: Pick<IntegrationCredential, 'revokedAt' | 'expiresAt' | 'lastUsedAt' | 'graceEndsAt' | 'supersededAt'>,
  now: Date = new Date(),
): IntegrationCredentialStatus {
  const nowMs = now.getTime();
  if (credential.revokedAt) {
    return 'revoked';
  }
  const expiresAt = ms(credential.expiresAt as Millis | null);
  if (expiresAt !== null && expiresAt <= nowMs) {
    return 'expired';
  }
  if (credential.supersededAt) {
    const graceEnds = ms(credential.graceEndsAt as Millis | null);
    return graceEnds !== null && graceEnds > nowMs ? 'rotating' : 'expired';
  }
  return credential.lastUsedAt ? 'active' : 'issued';
}

export function canAuthenticate(status: IntegrationCredentialStatus): boolean {
  return status === 'issued' || status === 'active' || status === 'rotating';
}

export function scopeOf(credential: Pick<IntegrationCredential, 'scope'>): IntegrationCredentialScope {
  return credential.scope ?? { type: 'manufacturer' };
}

export function secretFingerprint(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex').slice(0, 12);
}

export function shouldRecordUse(credential: Pick<IntegrationCredential, 'lastUsedAt'>, now: Date = new Date()): boolean {
  const last = ms(credential.lastUsedAt as Millis | null);
  return last === null || now.getTime() - last >= LAST_USED_WRITE_INTERVAL_MS;
}
