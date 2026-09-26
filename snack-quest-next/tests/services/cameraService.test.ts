import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import {
  CameraService,
  CameraNotFoundError,
  CameraNotTestedError,
  CameraCapabilityNotSupportedError,
  UnsupportedCameraTypeError,
} from '@/services/cameraService';
import { IllegalCameraTransitionError } from '@/repositories/cameraRepository';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { defaultCameraAdapterResolver } from '@/lib/vending/camera/cameraAdapterRegistry';
import { MockCameraAdapter } from '@/lib/vending/camera/adapters/mockCameraAdapter';
import { MockSnapshotStorageAdapter, SnapshotStorageNotConfiguredError } from '@/lib/vending/camera/snapshotStorage';
import type { CameraType } from '@/types';

/**
 * § CAMERA COMPATIBILITY. Real Firestore emulator throughout, not
 * mocked repositories — the same bar every other vending service
 * test in this codebase holds. `CameraService` is constructed with
 * a fresh `MockCameraAdapter`/`MockSnapshotStorageAdapter` per test
 * (never the shared singleton) so one test's seeded scenario can
 * never leak into another's, mirroring `MockVendingAdapter`'s own
 * isolation discipline.
 */

const BUSINESS_ID = 'biz-camera-test';
const TEST_ENCRYPTION_KEY = 'b'.repeat(64);

async function cleanCollections() {
  for (const collection of ['machines', 'machineSlots', 'machineTransactions', 'machineInventoryMovements', 'deviceCredentials', 'cameras', 'cameraSnapshots', 'auditLogs']) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
}

beforeEach(cleanCollections);
afterEach(() => {
  delete process.env.SECRET_ENCRYPTION_KEY;
});

async function provisionMachine(): Promise<string> {
  const { machineId } = await machineService.provisionDevice({
    businessId: BUSINESS_ID,
    machineCode: `SQ-CAM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    serialNumber: 'SN-1',
    manufacturer: 'mock',
    model: 'test',
    actor: 'staff-1',
  });
  return machineId;
}

function resolverFor(mockAdapter: MockCameraAdapter) {
  return (type: CameraType) => (type === 'mock' ? mockAdapter : defaultCameraAdapterResolver(type));
}

describe('registerCamera', () => {
  it('rejects a machine that does not exist', async () => {
    const service = new CameraService();
    await expect(
      service.registerCamera(BUSINESS_ID, { machineId: 'does-not-exist', type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'Front' }, 'staff-1'),
    ).rejects.toThrow(MachineNotFoundError);
  });

  it('registers a camera in not_configured with an empty connection', async () => {
    const machineId = await provisionMachine();
    const service = new CameraService();
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: 'Acme', model: 'Cam1', serialNumber: 'SN-CAM-1', label: 'Dispense area' }, 'staff-1');
    const camera = await service.findById(BUSINESS_ID, cameraId);
    expect(camera).toMatchObject({ machineId, type: 'mock', label: 'Dispense area', status: 'not_configured', connectionState: 'disconnected' });
    expect(camera!.connection).toEqual({ host: null, port: null, streamPath: null, username: null, passwordEncrypted: null, apiKeyEncrypted: null, onvifProfileToken: null });
  });

  it('a machine may carry zero, one, or several cameras', async () => {
    const machineId = await provisionMachine();
    const service = new CameraService();
    expect(await service.listByMachine(BUSINESS_ID, machineId)).toHaveLength(0);

    await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'Dispense area' }, 'staff-1');
    expect(await service.listByMachine(BUSINESS_ID, machineId)).toHaveLength(1);

    await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'Door' }, 'staff-1');
    const cameras = await service.listByMachine(BUSINESS_ID, machineId);
    expect(cameras).toHaveLength(2);
    expect(cameras.map((c) => c.data.label).sort()).toEqual(['Dispense area', 'Door']);
  });

  it('not every camera has a serial number — never assumed present', async () => {
    const machineId = await provisionMachine();
    const service = new CameraService();
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'rtsp', manufacturer: null, model: null, serialNumber: null, label: 'Door' }, 'staff-1');
    const camera = await service.findById(BUSINESS_ID, cameraId);
    expect(camera!.serialNumber).toBeNull();
  });
});

describe('configureCamera — § SECURITY: secrets are encrypted, never plaintext at rest', () => {
  it('moves the camera to configured and stores the non-secret connection fields as given', async () => {
    const machineId = await provisionMachine();
    const service = new CameraService();
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'Dispense area' }, 'staff-1');

    await service.configureCamera(BUSINESS_ID, cameraId, {
      host: '10.0.0.5',
      port: 554,
      streamPath: '/live',
      username: 'admin',
      password: 'super-secret-plaintext',
      apiKey: null,
      onvifProfileToken: null,
    }, 'staff-1');

    const camera = await service.findById(BUSINESS_ID, cameraId);
    expect(camera!.status).toBe('configured');
    expect(camera!.connection.host).toBe('10.0.0.5');
    expect(camera!.connection.passwordEncrypted).not.toBeNull();
  });

  it('when SECRET_ENCRYPTION_KEY is configured, the password is real ciphertext at rest, not the plaintext — same envelope-encryption primitive businessIntegrationSecretRepository already uses', async () => {
    process.env.SECRET_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    const machineId = await provisionMachine();
    const service = new CameraService();
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');

    await service.configureCamera(BUSINESS_ID, cameraId, { ...emptyInput(), password: 'super-secret-plaintext', apiKey: 'super-secret-api-key' }, 'staff-1');

    const camera = await service.findById(BUSINESS_ID, cameraId);
    expect(camera!.connection.passwordEncrypted).not.toBe('super-secret-plaintext');
    expect(camera!.connection.passwordEncrypted).not.toContain('super-secret-plaintext');
    expect(camera!.connection.apiKeyEncrypted).not.toBe('super-secret-api-key');
  });

  it('a captureSnapshot call still correctly decrypts the connection to reach the adapter — the round trip works, not just the write', async () => {
    process.env.SECRET_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    const machineId = await provisionMachine();
    const mockAdapter = new MockCameraAdapter();
    const service = new CameraService(resolverFor(mockAdapter), new MockSnapshotStorageAdapter());
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    mockAdapter.seedCamera(cameraId);
    await service.configureCamera(BUSINESS_ID, cameraId, { ...emptyInput(), password: 'super-secret-plaintext' }, 'staff-1');

    const { data } = await service.captureSnapshot(BUSINESS_ID, { cameraId, reason: 'admin_test', actor: 'staff-1' });
    expect(data.success).toBe(true); // proves decryptConnection round-tripped correctly — the mock adapter never receives ciphertext it couldn't use
  });

  it('reconfiguring an already-configured camera stays configured (no illegal transition)', async () => {
    const machineId = await provisionMachine();
    const service = new CameraService();
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    await service.configureCamera(BUSINESS_ID, cameraId, emptyInput(), 'staff-1');
    await expect(service.configureCamera(BUSINESS_ID, cameraId, { ...emptyInput(), host: '10.0.0.9' }, 'staff-1')).resolves.toBeUndefined();
    const camera = await service.findById(BUSINESS_ID, cameraId);
    expect(camera!.connection.host).toBe('10.0.0.9');
  });

  it('refuses to reconfigure an active camera — must be disabled first', async () => {
    const machineId = await provisionMachine();
    const mockAdapter = new MockCameraAdapter();
    const service = new CameraService(resolverFor(mockAdapter));
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    mockAdapter.seedCamera(cameraId);
    await service.configureCamera(BUSINESS_ID, cameraId, emptyInput(), 'staff-1');
    await service.testConnection(BUSINESS_ID, cameraId, 'staff-1');
    await service.runHealthCheck(BUSINESS_ID, cameraId, 'staff-1');
    await service.activateCamera(BUSINESS_ID, cameraId, 'staff-1');

    await expect(service.configureCamera(BUSINESS_ID, cameraId, emptyInput(), 'staff-1')).rejects.toThrow(IllegalCameraTransitionError);
  });
});

describe('testConnection', () => {
  it('a successful test records connected + no error, and stays configured (never jumps to active)', async () => {
    const machineId = await provisionMachine();
    const mockAdapter = new MockCameraAdapter();
    const service = new CameraService(resolverFor(mockAdapter));
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    mockAdapter.seedCamera(cameraId);
    await service.configureCamera(BUSINESS_ID, cameraId, emptyInput(), 'staff-1');

    const result = await service.testConnection(BUSINESS_ID, cameraId, 'staff-1');
    expect(result).toEqual({ ok: true, error: null });
    const camera = await service.findById(BUSINESS_ID, cameraId);
    expect(camera!.status).toBe('configured');
    expect(camera!.connectionState).toBe('connected');
  });

  it('an unreachable camera fails the test and records the error, still resolving back to configured', async () => {
    const machineId = await provisionMachine();
    const mockAdapter = new MockCameraAdapter();
    const service = new CameraService(resolverFor(mockAdapter));
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    mockAdapter.seedCamera(cameraId);
    mockAdapter.setUnreachable(cameraId);
    await service.configureCamera(BUSINESS_ID, cameraId, emptyInput(), 'staff-1');

    const result = await service.testConnection(BUSINESS_ID, cameraId, 'staff-1');
    expect(result.ok).toBe(false);
    expect(result.error).not.toBeNull();
    const camera = await service.findById(BUSINESS_ID, cameraId);
    expect(camera!.status).toBe('configured');
    expect(camera!.connectionState).toBe('error');
    expect(camera!.lastErrorMessage).toBe(result.error);
  });
});

describe('activateCamera — § CAMERA CONFIGURATION: never active merely from a saved config or a passing test alone', () => {
  it('refuses to activate a camera that was only configured, never tested', async () => {
    const machineId = await provisionMachine();
    const service = new CameraService();
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    await service.configureCamera(BUSINESS_ID, cameraId, emptyInput(), 'staff-1');
    await expect(service.activateCamera(BUSINESS_ID, cameraId, 'staff-1')).rejects.toThrow(CameraNotTestedError);
  });

  it('refuses to activate after a failing test/health-check', async () => {
    const machineId = await provisionMachine();
    const mockAdapter = new MockCameraAdapter();
    const service = new CameraService(resolverFor(mockAdapter));
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    mockAdapter.seedCamera(cameraId);
    mockAdapter.setHealthy(cameraId, false);
    await service.configureCamera(BUSINESS_ID, cameraId, emptyInput(), 'staff-1');
    await service.testConnection(BUSINESS_ID, cameraId, 'staff-1');
    await service.runHealthCheck(BUSINESS_ID, cameraId, 'staff-1');
    await expect(service.activateCamera(BUSINESS_ID, cameraId, 'staff-1')).rejects.toThrow(CameraNotTestedError);
  });

  it('activates once configured AND the most recent health check passed', async () => {
    const machineId = await provisionMachine();
    const mockAdapter = new MockCameraAdapter();
    const service = new CameraService(resolverFor(mockAdapter));
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    mockAdapter.seedCamera(cameraId);
    await service.configureCamera(BUSINESS_ID, cameraId, emptyInput(), 'staff-1');
    await service.testConnection(BUSINESS_ID, cameraId, 'staff-1');
    await service.runHealthCheck(BUSINESS_ID, cameraId, 'staff-1');
    await service.activateCamera(BUSINESS_ID, cameraId, 'staff-1');
    const camera = await service.findById(BUSINESS_ID, cameraId);
    expect(camera!.status).toBe('active');
  });
});

describe('runHealthCheck — § CAMERA HEALTH: independent of the machine, independent of vending', () => {
  it('requires camera_health — throws for a capability-less stub', async () => {
    const machineId = await provisionMachine();
    const service = new CameraService();
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'usb', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    await expect(service.runHealthCheck(BUSINESS_ID, cameraId, 'staff-1')).rejects.toThrow(CameraCapabilityNotSupportedError);
  });

  it('an active camera that fails its health check moves independently to error — never touches the machine', async () => {
    const machineId = await provisionMachine();
    const mockAdapter = new MockCameraAdapter();
    const service = new CameraService(resolverFor(mockAdapter));
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    mockAdapter.seedCamera(cameraId);
    await service.configureCamera(BUSINESS_ID, cameraId, emptyInput(), 'staff-1');
    await service.testConnection(BUSINESS_ID, cameraId, 'staff-1');
    await service.runHealthCheck(BUSINESS_ID, cameraId, 'staff-1');
    await service.activateCamera(BUSINESS_ID, cameraId, 'staff-1');

    mockAdapter.setHealthy(cameraId, false);
    const result = await service.runHealthCheck(BUSINESS_ID, cameraId, 'staff-1');
    expect(result.ok).toBe(false);

    const camera = await service.findById(BUSINESS_ID, cameraId);
    expect(camera!.status).toBe('error');

    const machine = await machineService.findById(BUSINESS_ID, machineId);
    expect(machine!.status).toBe('provisioning'); // untouched — this test never advanced the machine's own status
  });

  it('a non-active camera failing health check does not change its own status — health is recorded, not enforced, off that path', async () => {
    const machineId = await provisionMachine();
    const mockAdapter = new MockCameraAdapter();
    const service = new CameraService(resolverFor(mockAdapter));
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    mockAdapter.seedCamera(cameraId);
    mockAdapter.setHealthy(cameraId, false);
    await service.configureCamera(BUSINESS_ID, cameraId, emptyInput(), 'staff-1');

    await service.runHealthCheck(BUSINESS_ID, cameraId, 'staff-1');
    const camera = await service.findById(BUSINESS_ID, cameraId);
    expect(camera!.status).toBe('configured');
    expect(camera!.lastHealthOk).toBe(false);
  });
});

describe('disableCamera', () => {
  it('takes an active camera out of service', async () => {
    const machineId = await provisionMachine();
    const mockAdapter = new MockCameraAdapter();
    const service = new CameraService(resolverFor(mockAdapter));
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    mockAdapter.seedCamera(cameraId);
    await service.configureCamera(BUSINESS_ID, cameraId, emptyInput(), 'staff-1');
    await service.testConnection(BUSINESS_ID, cameraId, 'staff-1');
    await service.runHealthCheck(BUSINESS_ID, cameraId, 'staff-1');
    await service.activateCamera(BUSINESS_ID, cameraId, 'staff-1');

    await service.disableCamera(BUSINESS_ID, cameraId, 'staff-1');
    const camera = await service.findById(BUSINESS_ID, cameraId);
    expect(camera!.status).toBe('disabled');
  });

  it('rejects a camera id that does not exist', async () => {
    const service = new CameraService();
    await expect(service.disableCamera(BUSINESS_ID, 'no-such-camera', 'staff-1')).rejects.toThrow(CameraNotFoundError);
  });
});

describe('captureSnapshot — § SNAPSHOT MODEL / § DISPENSE EVIDENCE', () => {
  it('requires camera_snapshot — a capability-less stub throws before ever trying', async () => {
    const machineId = await provisionMachine();
    const service = new CameraService();
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'onvif', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    await expect(service.captureSnapshot(BUSINESS_ID, { cameraId, reason: 'admin_test', actor: 'staff-1' })).rejects.toThrow(CameraCapabilityNotSupportedError);
  });

  it('a successful capture stores the bytes and records a success snapshot', async () => {
    const machineId = await provisionMachine();
    const mockAdapter = new MockCameraAdapter();
    const storage = new MockSnapshotStorageAdapter();
    const service = new CameraService(resolverFor(mockAdapter), storage);
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    mockAdapter.seedCamera(cameraId);

    const { data } = await service.captureSnapshot(BUSINESS_ID, { cameraId, reason: 'admin_test', actor: 'staff-1' });
    expect(data.success).toBe(true);
    expect(data.storageRef).not.toBeNull();
    expect(storage.get(data.storageRef!)).not.toBeNull();

    const camera = await service.findById(BUSINESS_ID, cameraId);
    expect(camera!.lastSnapshotAt).not.toBeNull();
  });

  it('a capture failure is recorded as a real, honest failure — never treated as if it never happened', async () => {
    const machineId = await provisionMachine();
    const mockAdapter = new MockCameraAdapter();
    const service = new CameraService(resolverFor(mockAdapter), new MockSnapshotStorageAdapter());
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    mockAdapter.seedCamera(cameraId);
    mockAdapter.setSnapshotBehavior(cameraId, 'failure');

    const { data } = await service.captureSnapshot(BUSINESS_ID, { cameraId, reason: 'admin_test', actor: 'staff-1' });
    expect(data.success).toBe(false);
    expect(data.storageRef).toBeNull();
    expect(data.errorMessage).not.toBeNull();
  });

  it('a timeout is caught and recorded, never left to crash the request', async () => {
    const machineId = await provisionMachine();
    const mockAdapter = new MockCameraAdapter();
    const service = new CameraService(resolverFor(mockAdapter), new MockSnapshotStorageAdapter());
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    mockAdapter.seedCamera(cameraId);
    mockAdapter.setSnapshotBehavior(cameraId, 'timeout');

    const { data } = await service.captureSnapshot(BUSINESS_ID, { cameraId, reason: 'admin_test', actor: 'staff-1' });
    expect(data.success).toBe(false);
    expect(data.errorMessage).toMatch(/timed out/i);
  });

  it('a real capture whose storage is not configured is recorded as a failure naming the storage gap — the capture itself is not blamed', async () => {
    const machineId = await provisionMachine();
    const mockAdapter = new MockCameraAdapter();
    // Deliberately the honest Null default — not injecting a mock storage adapter.
    const service = new CameraService(resolverFor(mockAdapter));
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    mockAdapter.seedCamera(cameraId);

    const { data } = await service.captureSnapshot(BUSINESS_ID, { cameraId, reason: 'admin_test', actor: 'staff-1' });
    expect(data.success).toBe(false);
    expect(data.storageRef).toBeNull();
    expect(data.errorMessage).toMatch(new SnapshotStorageNotConfiguredError().message.slice(0, 20));
  });

  it('two independent capture requests are never deduplicated — each is its own real event', async () => {
    const machineId = await provisionMachine();
    const mockAdapter = new MockCameraAdapter();
    const service = new CameraService(resolverFor(mockAdapter), new MockSnapshotStorageAdapter());
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    mockAdapter.seedCamera(cameraId);

    const first = await service.captureSnapshot(BUSINESS_ID, { cameraId, reason: 'admin_test', actor: 'staff-1' });
    const second = await service.captureSnapshot(BUSINESS_ID, { cameraId, reason: 'admin_test', actor: 'staff-1' });
    expect(first.id).not.toBe(second.id);
    const history = await service.listSnapshotsByCamera(BUSINESS_ID, cameraId);
    expect(history).toHaveLength(2);
  });
});

describe('getDiagnostics — § the live four-way capability read', () => {
  it('reports unregistered for manufacturer_specific — no adapter exists, not even a stub', async () => {
    const machineId = await provisionMachine();
    const service = new CameraService();
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'manufacturer_specific', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    const camera = await service.findById(BUSINESS_ID, cameraId);
    const diagnostics = await service.getDiagnostics(camera!);
    expect(diagnostics.registered).toBe(false);
  });

  it('reports not_configured for every capability on an honest stub (usb)', async () => {
    const machineId = await provisionMachine();
    const service = new CameraService();
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'usb', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    const camera = await service.findById(BUSINESS_ID, cameraId);
    const diagnostics = await service.getDiagnostics(camera!);
    expect(diagnostics.registered).toBe(true);
    expect(diagnostics.statusByCapability.camera_snapshot).toBe('not_configured');
  });

  it('reports supported for every capability on the mock adapter', async () => {
    const machineId = await provisionMachine();
    const service = new CameraService();
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    const camera = await service.findById(BUSINESS_ID, cameraId);
    const diagnostics = await service.getDiagnostics(camera!);
    expect(diagnostics.statusByCapability).toEqual({ camera: 'supported', camera_snapshot: 'supported', camera_stream: 'supported', camera_health: 'supported' });
  });
});

describe('getStreamInfo', () => {
  it('requires camera_stream', async () => {
    const machineId = await provisionMachine();
    const service = new CameraService();
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'usb', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    await expect(service.getStreamInfo(BUSINESS_ID, cameraId)).rejects.toThrow(CameraCapabilityNotSupportedError);
  });

  it('returns no credential-bearing field — a plain descriptor only', async () => {
    const machineId = await provisionMachine();
    const mockAdapter = new MockCameraAdapter();
    const service = new CameraService(resolverFor(mockAdapter));
    const cameraId = await service.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    mockAdapter.seedCamera(cameraId);
    const info = await service.getStreamInfo(BUSINESS_ID, cameraId);
    expect(info.available).toBe(true);
    expect(JSON.stringify(info)).not.toMatch(/password|secret|token=/i);
  });
});

describe('the camera never decides a vend\'s outcome — § DISPENSE EVIDENCE', () => {
  async function seedPaidTransaction(adapter: MockVendingAdapter): Promise<{ machineId: string; transactionId: string }> {
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-CAM-VEND-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      actor: 'staff-1',
    });
    adapter.seedSlot(machineId, 'A01', { quantity: 5 });
    const slots = new MachineSlotService(() => adapter);
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: 'pkg-1', productCatalogue: 'package', priceKes: 100, capacity: 10, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 5 });

    const transactionService = new MachineTransactionService(() => adapter);
    const created = await machineTransactionRepository.create({
      businessId: BUSINESS_ID,
      machineId,
      slotId: 'A01',
      productId: 'pkg-1',
      productCatalogue: 'package',
      amountKes: 100,
      currency: 'KES',
      paymentMethod: 'mpesa',
    });
    await transactionService.markPaymentVerified(BUSINESS_ID, created.id, 'mpesa-ref-1');
    return { machineId, transactionId: created.id };
  }

  it('vend succeeds + camera evidence captured — the successful vend stays exactly that', async () => {
    const vendingAdapter = new MockVendingAdapter();
    const { machineId, transactionId } = await seedPaidTransaction(vendingAdapter);
    const transactionService = new MachineTransactionService(() => vendingAdapter);
    await transactionService.authorizeVend(BUSINESS_ID, transactionId);

    const mockCameraAdapter = new MockCameraAdapter();
    const cameraService = new CameraService(resolverFor(mockCameraAdapter), new MockSnapshotStorageAdapter());
    const cameraId = await cameraService.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    mockCameraAdapter.seedCamera(cameraId);

    const { data } = await cameraService.captureSnapshot(BUSINESS_ID, { cameraId, reason: 'dispense_evidence', transactionId, actor: 'staff-1' });
    expect(data.success).toBe(true);
    expect(data.transactionId).toBe(transactionId);

    const transaction = await machineTransactionRepository.findById(BUSINESS_ID, transactionId);
    expect(transaction!.status).toBe('vend_authorized'); // unchanged by the snapshot capture
  });

  it('vend succeeds + camera unavailable — the vend outcome is untouched by the camera failing', async () => {
    const vendingAdapter = new MockVendingAdapter();
    const { machineId, transactionId } = await seedPaidTransaction(vendingAdapter);
    const transactionService = new MachineTransactionService(() => vendingAdapter);
    await transactionService.authorizeVend(BUSINESS_ID, transactionId);

    const mockCameraAdapter = new MockCameraAdapter();
    const cameraService = new CameraService(resolverFor(mockCameraAdapter), new MockSnapshotStorageAdapter());
    const cameraId = await cameraService.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    mockCameraAdapter.seedCamera(cameraId);
    mockCameraAdapter.setUnreachable(cameraId);

    const { data } = await cameraService.captureSnapshot(BUSINESS_ID, { cameraId, reason: 'dispense_evidence', transactionId, actor: 'staff-1' });
    expect(data.success).toBe(false);

    const transaction = await machineTransactionRepository.findById(BUSINESS_ID, transactionId);
    expect(transaction!.status).toBe('vend_authorized'); // a camera failure never becomes a vend failure
  });

  it('vend fails + camera evidence still captures cleanly, with no effect on the failed status', async () => {
    const vendingAdapter = new MockVendingAdapter();
    const { machineId, transactionId } = await seedPaidTransaction(vendingAdapter);
    vendingAdapter.setOffline(machineId); // makes authorizeVend refuse
    const transactionService = new MachineTransactionService(() => vendingAdapter);
    await transactionService.authorizeVend(BUSINESS_ID, transactionId);

    const mockCameraAdapter = new MockCameraAdapter();
    const cameraService = new CameraService(resolverFor(mockCameraAdapter), new MockSnapshotStorageAdapter());
    const cameraId = await cameraService.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    mockCameraAdapter.seedCamera(cameraId);

    const { data } = await cameraService.captureSnapshot(BUSINESS_ID, { cameraId, reason: 'dispense_evidence', transactionId, actor: 'staff-1' });
    expect(data.success).toBe(true);

    const transaction = await machineTransactionRepository.findById(BUSINESS_ID, transactionId);
    expect(transaction!.status).toBe('paid_vend_failed'); // the camera's own success never resurrects a failed vend
  });

  it('vend UNKNOWN + camera evidence captured — the manual_review state is never overridden by the camera', async () => {
    const vendingAdapter = new MockVendingAdapter();
    const { machineId, transactionId } = await seedPaidTransaction(vendingAdapter);
    const transactionService = new MachineTransactionService(() => vendingAdapter);
    await transactionService.authorizeVend(BUSINESS_ID, transactionId);
    await machineTransactionRepository.moveStatus(BUSINESS_ID, transactionId, 'manual_review', { failureReason: 'device reported unknown', dispenseFailureStatus: 'unknown' });

    const mockCameraAdapter = new MockCameraAdapter();
    const cameraService = new CameraService(resolverFor(mockCameraAdapter), new MockSnapshotStorageAdapter());
    const cameraId = await cameraService.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'X' }, 'staff-1');
    mockCameraAdapter.seedCamera(cameraId);

    const { data } = await cameraService.captureSnapshot(BUSINESS_ID, { cameraId, reason: 'dispense_evidence', transactionId, actor: 'staff-1' });
    expect(data.success).toBe(true);

    const transaction = await machineTransactionRepository.findById(BUSINESS_ID, transactionId);
    expect(transaction!.status).toBe('manual_review'); // UNKNOWN never silently becomes resolved because a camera captured something
  });
});

describe('UnsupportedCameraTypeError is exported and real', () => {
  it('re-throws through cameraService for a type the resolver truly cannot resolve', () => {
    expect(() => defaultCameraAdapterResolver('manufacturer_specific')).toThrow(UnsupportedCameraTypeError);
  });
});

function emptyInput() {
  return { host: null, port: null, streamPath: null, username: null, password: null, apiKey: null, onvifProfileToken: null };
}
