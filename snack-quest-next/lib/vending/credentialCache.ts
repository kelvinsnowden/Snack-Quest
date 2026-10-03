import type { IntegrationCredential } from '@/types';

/**
 * A short-lived, per-instance cache of credential documents.
 *
 * Why: without it every signed request costs a Firestore read before
 * the HMAC is even checked, so a flood of forged requests naming a real
 * key id — or a thousand random key ids — becomes a flood of billed
 * reads. With it, a warm instance verifies a signature from memory.
 *
 * The cost is revocation latency: an instance that already holds a key
 * keeps honouring it until the entry expires. `CREDENTIAL_CACHE_TTL_MS`
 * bounds that (30 s by default), the revoking instance drops its entry
 * immediately, and the external documentation states "revocation takes
 * effect within 30 seconds" — never "immediately".
 *
 * Unknown key ids are cached too (negative entries, shorter TTL), so a
 * random-key flood costs one read per distinct id per instance at most.
 */

const DEFAULT_TTL_MS = 30_000;
const NEGATIVE_TTL_MS = 10_000;
const MAX_ENTRIES = 5_000;

interface Entry {
  credential: IntegrationCredential | null;
  expiresAt: number;
}

const entries = new Map<string, Entry>();

function ttl(): number {
  const raw = process.env.CREDENTIAL_CACHE_TTL_MS;
  if (raw !== undefined && raw !== '') {
    const configured = Number(raw);
    if (Number.isFinite(configured) && configured >= 0) {
      return configured;
    }
  }
  // Off under test unless a test turns it on: fixtures mutate credential
  // documents directly and must see the change on the next request.
  return process.env.NODE_ENV === 'test' ? 0 : DEFAULT_TTL_MS;
}

export async function getCachedCredential(
  keyId: string,
  load: (keyId: string) => Promise<IntegrationCredential | null>,
  now: number = Date.now(),
): Promise<IntegrationCredential | null> {
  const hit = entries.get(keyId);
  if (hit && hit.expiresAt > now) {
    return hit.credential;
  }
  const credential = await load(keyId);
  const lifetime = credential ? ttl() : Math.min(ttl(), NEGATIVE_TTL_MS);
  if (lifetime > 0) {
    if (entries.size >= MAX_ENTRIES) {
      // Drop the oldest insertion — Map iteration order is insertion order.
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) {
        entries.delete(oldest);
      }
    }
    entries.set(keyId, { credential, expiresAt: now + lifetime });
  }
  return credential;
}

/** Keeps the cached copy's bookkeeping current so this instance doesn't re-write `lastUsedAt` on every request. */
export function noteCredentialUse(keyId: string, at: { toMillis(): number }): void {
  const hit = entries.get(keyId);
  if (hit?.credential) {
    hit.credential = { ...hit.credential, lastUsedAt: at as IntegrationCredential['lastUsedAt'], firstUsedAt: hit.credential.firstUsedAt ?? (at as IntegrationCredential['lastUsedAt']) };
  }
}

export function invalidateCredentialCache(keyId?: string): void {
  if (keyId) {
    entries.delete(keyId);
  } else {
    entries.clear();
  }
}

const manufacturerStatuses = new Map<string, { status: string | null; expiresAt: number }>();

/**
 * A manufacturer's status (`active` / `suspended`), cached like its
 * credentials: every authenticated request checks it, and suspension
 * reaches every instance within the same bound as revocation.
 */
export async function getCachedManufacturerStatus(manufacturerId: string, load: (manufacturerId: string) => Promise<string | null>, now: number = Date.now()): Promise<string | null> {
  const hit = manufacturerStatuses.get(manufacturerId);
  if (hit && hit.expiresAt > now) {
    return hit.status;
  }
  const status = await load(manufacturerId);
  const lifetime = ttl();
  if (lifetime > 0) {
    if (manufacturerStatuses.size >= MAX_ENTRIES) {
      const oldest = manufacturerStatuses.keys().next().value;
      if (oldest !== undefined) manufacturerStatuses.delete(oldest);
    }
    manufacturerStatuses.set(manufacturerId, { status, expiresAt: now + lifetime });
  }
  return status;
}

export function invalidateManufacturerStatus(manufacturerId?: string): void {
  if (manufacturerId) {
    manufacturerStatuses.delete(manufacturerId);
  } else {
    manufacturerStatuses.clear();
  }
}
