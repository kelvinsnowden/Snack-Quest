import { randomUUID } from 'node:crypto';

/**
 * `SnapshotStorageAdapter` — where a captured snapshot's bytes
 * actually live (§ SNAPSHOT MODEL: "Do not store arbitrary image
 * blobs directly inside Firestore documents... If there is no
 * suitable storage layer, create a clean storage abstraction rather
 * than hardcoding a vendor"). This codebase has no object-storage
 * integration anywhere today (no Firebase Storage / GCS bucket
 * client exists in any existing service) — confirmed before writing
 * this, not assumed — so this is a real gap, not a wrapper around
 * something that already works.
 *
 * `CameraSnapshot.storageRef` is the only thing a `cameraService`
 * caller ever persists; the bytes themselves pass through this
 * interface and are never written to Firestore.
 */
export interface SnapshotStorageAdapter {
  readonly name: string;
  store(input: { businessId: string; cameraId: string; machineId: string; capturedAt: Date; data: Uint8Array; contentType: string | null }): Promise<{ storageRef: string }>;
}

export class SnapshotStorageNotConfiguredError extends Error {
  constructor() {
    super(
      'No real object-storage backend is wired for camera snapshots yet — see lib/vending/camera/snapshotStorage.ts. ' +
        'The capture itself may have succeeded; only persisting its bytes failed.',
    );
    this.name = 'SnapshotStorageNotConfiguredError';
  }
}

/**
 * The honest default — the same role `NullCloudTransport` plays for
 * `CloudTransport`. It does not pretend to store anything: it throws
 * a named error `cameraService.captureSnapshot` catches and records
 * as a real, visible gap (`CameraSnapshot.success: false`,
 * `errorMessage` naming exactly this), rather than fabricating a
 * `storageRef` that resolves to nothing. Wiring a real bucket-backed
 * adapter (Firebase Storage, S3, or whatever this deployment already
 * uses elsewhere) is real future work; this default is deliberately
 * not that, and does not claim to be.
 */
export class NullSnapshotStorageAdapter implements SnapshotStorageAdapter {
  readonly name = 'none';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- must match SnapshotStorageAdapter's own signature; this implementation never reaches a real store.
  async store(_input: Parameters<SnapshotStorageAdapter['store']>[0]): Promise<{ storageRef: string }> {
    throw new SnapshotStorageNotConfiguredError();
  }
}

/**
 * In-memory, test-only — proves the capture → store → reference
 * pipeline actually moves real bytes end to end without a real
 * bucket. `get` is a test helper, not part of the interface.
 */
export class MockSnapshotStorageAdapter implements SnapshotStorageAdapter {
  readonly name = 'mock';
  private readonly stored = new Map<string, Uint8Array>();

  async store(input: Parameters<SnapshotStorageAdapter['store']>[0]): Promise<{ storageRef: string }> {
    const storageRef = `mock-storage://${input.businessId}/${input.cameraId}/${randomUUID()}`;
    this.stored.set(storageRef, input.data);
    return { storageRef };
  }

  /** Test helper — retrieves what was actually stored under a reference, to prove the bytes really moved. */
  get(storageRef: string): Uint8Array | null {
    return this.stored.get(storageRef) ?? null;
  }
}

export const defaultSnapshotStorageAdapter: SnapshotStorageAdapter = new NullSnapshotStorageAdapter();
