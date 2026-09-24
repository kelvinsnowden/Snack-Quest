import { describe, expect, it } from 'vitest';
import { MockCameraAdapter } from '@/lib/vending/camera/adapters/mockCameraAdapter';
import { CameraOperationTimeoutError } from '@/lib/vending/camera/cameraAdapter';
import { FULL_CAMERA_CAPABILITIES } from '@/lib/vending/camera/capabilities';

function emptyConnection() {
  return { host: null, port: null, streamPath: null, username: null, password: null, apiKey: null, onvifProfileToken: null };
}

describe('MockCameraAdapter — § MOCK CAMERA', () => {
  it('declares every capability true — the reference full-capability adapter', () => {
    expect(new MockCameraAdapter().capabilities()).toEqual(FULL_CAMERA_CAPABILITIES);
  });

  it('a seeded camera connects, reports connected status, and disconnects cleanly', async () => {
    const adapter = new MockCameraAdapter();
    adapter.seedCamera('cam-1');
    await expect(adapter.connect('cam-1', emptyConnection())).resolves.toBeUndefined();
    const status = await adapter.getStatus('cam-1', emptyConnection());
    expect(status.connectionState).toBe('connected');
    await expect(adapter.disconnect('cam-1', emptyConnection())).resolves.toBeUndefined();
  });

  it('an unreachable camera refuses to connect and reports an error status', async () => {
    const adapter = new MockCameraAdapter();
    adapter.seedCamera('cam-1');
    adapter.setUnreachable('cam-1');
    await expect(adapter.connect('cam-1', emptyConnection())).rejects.toThrow(/unreachable/);
    const status = await adapter.getStatus('cam-1', emptyConnection());
    expect(status.connectionState).toBe('error');
  });

  it('setReachable brings an unreachable camera back', async () => {
    const adapter = new MockCameraAdapter();
    adapter.seedCamera('cam-1');
    adapter.setUnreachable('cam-1');
    adapter.setReachable('cam-1');
    await expect(adapter.connect('cam-1', emptyConnection())).resolves.toBeUndefined();
  });

  describe('healthCheck', () => {
    it('reports healthy by default once seeded', async () => {
      const adapter = new MockCameraAdapter();
      adapter.seedCamera('cam-1');
      const result = await adapter.healthCheck('cam-1', emptyConnection());
      expect(result).toMatchObject({ ok: true, error: null });
    });

    it('reports unhealthy when configured to — a reachable camera can still fail its own health check', async () => {
      const adapter = new MockCameraAdapter();
      adapter.seedCamera('cam-1');
      adapter.setHealthy('cam-1', false);
      const result = await adapter.healthCheck('cam-1', emptyConnection());
      expect(result.ok).toBe(false);
      expect(result.error).not.toBeNull();
    });

    it('reports unhealthy for an unreachable camera regardless of the healthy flag', async () => {
      const adapter = new MockCameraAdapter();
      adapter.seedCamera('cam-1');
      adapter.setHealthy('cam-1', true);
      adapter.setUnreachable('cam-1');
      const result = await adapter.healthCheck('cam-1', emptyConnection());
      expect(result.ok).toBe(false);
    });
  });

  describe('captureSnapshot', () => {
    it('succeeds by default once seeded, returning real bytes', async () => {
      const adapter = new MockCameraAdapter();
      adapter.seedCamera('cam-1');
      const result = await adapter.captureSnapshot('cam-1', emptyConnection());
      expect(result.ok).toBe(true);
      expect(result.data).not.toBeNull();
      expect(result.data!.byteLength).toBeGreaterThan(0);
    });

    it('fails when configured to, with no data and a real error', async () => {
      const adapter = new MockCameraAdapter();
      adapter.seedCamera('cam-1');
      adapter.setSnapshotBehavior('cam-1', 'failure');
      const result = await adapter.captureSnapshot('cam-1', emptyConnection());
      expect(result.ok).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error).not.toBeNull();
    });

    it('throws CameraOperationTimeoutError when configured to time out', async () => {
      const adapter = new MockCameraAdapter();
      adapter.seedCamera('cam-1');
      adapter.setSnapshotBehavior('cam-1', 'timeout');
      await expect(adapter.captureSnapshot('cam-1', emptyConnection())).rejects.toThrow(CameraOperationTimeoutError);
    });

    it('fails for an unreachable camera without even reaching the configured behavior', async () => {
      const adapter = new MockCameraAdapter();
      adapter.seedCamera('cam-1');
      adapter.setUnreachable('cam-1');
      const result = await adapter.captureSnapshot('cam-1', emptyConnection());
      expect(result.ok).toBe(false);
    });
  });

  describe('getStreamInfo', () => {
    it('reports available by default once seeded', async () => {
      const adapter = new MockCameraAdapter();
      adapter.seedCamera('cam-1');
      const info = await adapter.getStreamInfo('cam-1', emptyConnection());
      expect(info.available).toBe(true);
      expect(info.protocol).not.toBeNull();
    });

    it('reports unavailable when configured to', async () => {
      const adapter = new MockCameraAdapter();
      adapter.seedCamera('cam-1');
      adapter.setStreamAvailable('cam-1', false);
      const info = await adapter.getStreamInfo('cam-1', emptyConnection());
      expect(info).toEqual({ available: false, protocol: null, host: null, port: null, streamPath: null });
    });

    it('never returns embedded credentials — no field on the result could carry them', async () => {
      const adapter = new MockCameraAdapter();
      adapter.seedCamera('cam-1');
      const info = await adapter.getStreamInfo('cam-1', emptyConnection());
      expect(Object.keys(info).sort()).toEqual(['available', 'host', 'port', 'protocol', 'streamPath']);
    });
  });

  it('state is per-instance — a fresh adapter never inherits another instance\'s seeded scenario', async () => {
    const first = new MockCameraAdapter();
    first.seedCamera('cam-1');
    first.setUnreachable('cam-1');

    const second = new MockCameraAdapter();
    second.seedCamera('cam-1');
    await expect(second.connect('cam-1', emptyConnection())).resolves.toBeUndefined();
  });
});
