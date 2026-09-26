import { describe, expect, it } from 'vitest';
import { NullSnapshotStorageAdapter, MockSnapshotStorageAdapter, SnapshotStorageNotConfiguredError } from '@/lib/vending/camera/snapshotStorage';

describe('SnapshotStorageAdapter — § SNAPSHOT MODEL', () => {
  it('NullSnapshotStorageAdapter throws a named, honest error rather than fabricating a storageRef', async () => {
    const adapter = new NullSnapshotStorageAdapter();
    await expect(
      adapter.store({ businessId: 'biz-1', cameraId: 'cam-1', machineId: 'm-1', capturedAt: new Date(), data: new Uint8Array([1, 2, 3]), contentType: null }),
    ).rejects.toThrow(SnapshotStorageNotConfiguredError);
  });

  it('MockSnapshotStorageAdapter actually moves the bytes end to end', async () => {
    const adapter = new MockSnapshotStorageAdapter();
    const data = new Uint8Array([9, 8, 7, 6]);
    const { storageRef } = await adapter.store({ businessId: 'biz-1', cameraId: 'cam-1', machineId: 'm-1', capturedAt: new Date(), data, contentType: 'application/octet-stream' });
    expect(storageRef).toContain('biz-1');
    expect(storageRef).toContain('cam-1');
    expect(adapter.get(storageRef)).toEqual(data);
  });

  it('MockSnapshotStorageAdapter never returns bytes for a reference it never stored', () => {
    const adapter = new MockSnapshotStorageAdapter();
    expect(adapter.get('mock-storage://nothing/here')).toBeNull();
  });
});
