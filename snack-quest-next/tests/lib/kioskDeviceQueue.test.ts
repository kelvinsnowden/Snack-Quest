import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { PersistedBatchQueue, loadVerifiedMedia, sha256Hex, type StorageLike } from '@/lib/kiosk/deviceQueue';

/** The screen's outbox and its verified ad files (§ OFFLINE CACHE, § PLAYBACK EVENTS). */

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), removeItem: (key) => void data.delete(key) };
}

describe('PersistedBatchQueue', () => {
  it('an unacknowledged batch is resent with the same id; nothing is in two batches', () => {
    const queue = new PersistedBatchQueue<number>(memoryStorage(), 'q', { batchSize: 2, maxPending: 100 });
    [1, 2, 3].forEach((n) => queue.add(n));
    const first = queue.nextBatch()!;
    expect(first.items).toEqual([1, 2]);
    queue.add(4);
    expect(queue.nextBatch()).toEqual(first);
    queue.acknowledge(first.batchId);
    const second = queue.nextBatch()!;
    expect(second.items).toEqual([3, 4]);
    expect(second.batchId).not.toBe(first.batchId);
    queue.acknowledge('some-other-id');
    expect(queue.nextBatch()).toEqual(second);
  });

  it('survives a reboot', () => {
    const storage = memoryStorage();
    const before = new PersistedBatchQueue<string>(storage, 'q', { batchSize: 10, maxPending: 100 });
    before.add('a');
    const batch = before.nextBatch()!;
    before.add('b');
    const after = new PersistedBatchQueue<string>(storage, 'q', { batchSize: 10, maxPending: 100 });
    expect(after.nextBatch()).toEqual(batch);
    expect(after.size()).toBe(2);
  });

  it('when full, drops the oldest and says how many', () => {
    const queue = new PersistedBatchQueue<number>(memoryStorage(), 'q', { batchSize: 10, maxPending: 3 });
    [1, 2, 3, 4, 5].forEach((n) => queue.add(n));
    expect(queue.dropped()).toBe(2);
    expect(queue.nextBatch()!.items).toEqual([3, 4, 5]);
  });

  it('corrupt storage starts empty rather than crashing the screen', () => {
    const storage = memoryStorage();
    storage.setItem('q', '{not json');
    expect(new PersistedBatchQueue<number>(storage, 'q', { batchSize: 1, maxPending: 1 }).size()).toBe(0);
  });
});

describe('loadVerifiedMedia', () => {
  const bytes = new TextEncoder().encode('pretend this is a webp');
  const sha = createHash('sha256').update(bytes).digest('hex');

  it('computes the same SHA-256 as the server', async () => {
    expect(await sha256Hex(bytes.buffer as ArrayBuffer)).toBe(sha);
  });

  it('plays a file whose checksum matches', async () => {
    const createObjectURL = vi.fn(() => 'blob:ok');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL }));
    const fetchImpl = vi.fn(async () => new Response(bytes, { status: 200 }));
    const result = await loadVerifiedMedia({ mediaUrl: 'https://blob.example/a.webp', sha256: sha, mimeType: 'image/webp' }, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ url: 'blob:ok', fromCache: false, rejected: false });
  });

  it('refuses a file that doesn’t match — tampered in transit or swapped in storage', async () => {
    const fetchImpl = vi.fn(async () => new Response(new TextEncoder().encode('something else'), { status: 200 }));
    const result = await loadVerifiedMedia({ mediaUrl: 'https://blob.example/a.webp', sha256: sha, mimeType: 'image/webp' }, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ url: null, fromCache: false, rejected: true });
  });

  it('a network failure is not a rejection — it can be retried', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await loadVerifiedMedia({ mediaUrl: 'https://blob.example/a.webp', sha256: sha, mimeType: 'image/webp' }, fetchImpl as unknown as typeof fetch)).toEqual({ url: null, fromCache: false, rejected: false });
  });
});
