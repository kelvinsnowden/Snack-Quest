/**
 * What the machine screen keeps until the server has it (§ OFFLINE CACHE,
 * § PLAYBACK EVENTS, § KIOSK OBSERVABILITY). Items wait in `pending`; a
 * flush moves up to `batchSize` of them into one batch with a fresh id and
 * sends it. The batch stays, with the same id, until the server
 * acknowledges it — so a dropped response is resent as the same batch (the
 * server counts it once) and no item is ever in two batches. Everything is
 * persisted, so a reboot loses nothing but what the storage cap drops.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface QueueBatch<T> {
  batchId: string;
  items: T[];
}

interface QueueState<T> {
  pending: T[];
  batch: QueueBatch<T> | null;
  /** Items dropped because the queue was full — reported, never silent. */
  dropped: number;
}

function newId(): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return random.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);
}

export class PersistedBatchQueue<T> {
  private state: QueueState<T>;

  constructor(
    private readonly storage: StorageLike | null,
    private readonly key: string,
    private readonly options: { batchSize: number; maxPending: number },
  ) {
    this.state = this.load();
  }

  private load(): QueueState<T> {
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) return { pending: [], batch: null, dropped: 0 };
      const parsed = JSON.parse(raw) as QueueState<T>;
      return { pending: Array.isArray(parsed.pending) ? parsed.pending : [], batch: parsed.batch && typeof parsed.batch.batchId === 'string' && Array.isArray(parsed.batch.items) ? parsed.batch : null, dropped: Number(parsed.dropped) || 0 };
    } catch {
      return { pending: [], batch: null, dropped: 0 };
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.state));
    } catch {
      // Storage full or unavailable: the queue still works in memory until the next reboot.
    }
  }

  add(item: T): void {
    this.state.pending.push(item);
    const overflow = this.state.pending.length - this.options.maxPending;
    if (overflow > 0) {
      this.state.pending.splice(0, overflow);
      this.state.dropped += overflow;
    }
    this.save();
  }

  /** The batch to send now: the unacknowledged one if there is one, else a new one from pending, else null. */
  nextBatch(): QueueBatch<T> | null {
    if (this.state.batch) return this.state.batch;
    if (this.state.pending.length === 0) return null;
    this.state.batch = { batchId: newId(), items: this.state.pending.splice(0, this.options.batchSize) };
    this.save();
    return this.state.batch;
  }

  /** The server has this batch: forget it. Acknowledging any other id does nothing. */
  acknowledge(batchId: string): void {
    if (this.state.batch?.batchId !== batchId) return;
    this.state.batch = null;
    this.save();
  }

  size(): number {
    return this.state.pending.length + (this.state.batch?.items.length ?? 0);
  }

  dropped(): number {
    return this.state.dropped;
  }

  clear(): void {
    this.state = { pending: [], batch: null, dropped: 0 };
    this.save();
  }
}

/** Hex SHA-256 of bytes, with the browser's own Web Crypto. Null where Web Crypto isn't available (then nothing is trusted). */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const MEDIA_CACHE = 'sq-kiosk-ads-v1';

/**
 * Gets an ad's file — from the device cache when it has it, else the
 * network — and accepts it only if its SHA-256 matches the checksum the
 * server computed at upload. A mismatch is never played and never cached.
 * Returns a local object URL to play, or null.
 */
export async function loadVerifiedMedia(creative: { mediaUrl: string; sha256: string; mimeType: string }, fetchImpl: typeof fetch = fetch): Promise<{ url: string | null; fromCache: boolean; rejected: boolean }> {
  const cacheStorage = typeof caches !== 'undefined' ? caches : null;
  let cache: Cache | null = null;
  try {
    cache = cacheStorage ? await cacheStorage.open(MEDIA_CACHE) : null;
  } catch {
    cache = null;
  }
  let response = cache ? await cache.match(creative.mediaUrl).catch(() => undefined) : undefined;
  const fromCache = Boolean(response);
  if (!response) {
    try {
      response = await fetchImpl(creative.mediaUrl, { cache: 'no-store' });
    } catch {
      return { url: null, fromCache: false, rejected: false };
    }
    if (!response.ok) return { url: null, fromCache: false, rejected: false };
  }
  const bytes = await response.clone().arrayBuffer();
  const digest = await sha256Hex(bytes);
  if (digest === null || digest !== creative.sha256) {
    if (fromCache) await cache?.delete(creative.mediaUrl).catch(() => false);
    return { url: null, fromCache, rejected: digest !== null };
  }
  if (!fromCache && cache) await cache.put(creative.mediaUrl, response).catch(() => undefined);
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return { url: null, fromCache, rejected: false };
  return { url: URL.createObjectURL(new Blob([bytes], { type: creative.mimeType })), fromCache, rejected: false };
}

/** Forgets every cached ad file (service mode → "Clear screen cache"). */
export async function clearMediaCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  await caches.delete(MEDIA_CACHE).catch(() => false);
}
