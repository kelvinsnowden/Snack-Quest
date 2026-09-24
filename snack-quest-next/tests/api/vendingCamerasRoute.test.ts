import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  verifyStaffSessionFromRequestMock,
  registerCameraMock,
  listByMachineMock,
  findByIdMock,
  getDiagnosticsMock,
  configureCameraMock,
  testConnectionMock,
  runHealthCheckMock,
  activateCameraMock,
  disableCameraMock,
  captureSnapshotMock,
  listSnapshotsByCameraMock,
  getStreamInfoMock,
} = vi.hoisted(() => ({
  verifyStaffSessionFromRequestMock: vi.fn(),
  registerCameraMock: vi.fn(),
  listByMachineMock: vi.fn(),
  findByIdMock: vi.fn(),
  getDiagnosticsMock: vi.fn(),
  configureCameraMock: vi.fn(),
  testConnectionMock: vi.fn(),
  runHealthCheckMock: vi.fn(),
  activateCameraMock: vi.fn(),
  disableCameraMock: vi.fn(),
  captureSnapshotMock: vi.fn(),
  listSnapshotsByCameraMock: vi.fn(),
  getStreamInfoMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/services/cameraService', async () => {
  const actual = await vi.importActual<typeof import('@/services/cameraService')>('@/services/cameraService');
  return {
    ...actual,
    cameraService: {
      registerCamera: registerCameraMock,
      listByMachine: listByMachineMock,
      findById: findByIdMock,
      getDiagnostics: getDiagnosticsMock,
      configureCamera: configureCameraMock,
      testConnection: testConnectionMock,
      runHealthCheck: runHealthCheckMock,
      activateCamera: activateCameraMock,
      disableCamera: disableCameraMock,
      captureSnapshot: captureSnapshotMock,
      listSnapshotsByCamera: listSnapshotsByCameraMock,
      getStreamInfo: getStreamInfoMock,
    },
  };
});

import { GET as camerasGet, POST as camerasPost } from '@/app/api/vending/machines/[id]/cameras/route';
import { GET as cameraGet } from '@/app/api/vending/cameras/[cameraId]/route';
import { PATCH as configurePatch } from '@/app/api/vending/cameras/[cameraId]/configure/route';
import { POST as testPost } from '@/app/api/vending/cameras/[cameraId]/test/route';
import { POST as healthCheckPost } from '@/app/api/vending/cameras/[cameraId]/health-check/route';
import { POST as activatePost } from '@/app/api/vending/cameras/[cameraId]/activate/route';
import { POST as disablePost } from '@/app/api/vending/cameras/[cameraId]/disable/route';
import { POST as snapshotPost } from '@/app/api/vending/cameras/[cameraId]/snapshot/route';
import { GET as snapshotsGet } from '@/app/api/vending/cameras/[cameraId]/snapshots/route';
import { GET as streamInfoGet } from '@/app/api/vending/cameras/[cameraId]/stream-info/route';
import { CameraNotFoundError, CameraNotTestedError, CameraCapabilityNotSupportedError } from '@/services/cameraService';
import { IllegalCameraTransitionError } from '@/repositories/cameraRepository';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { auditLogRepository } from '@/repositories/auditLogRepository';
import { adminFirestore } from '@/lib/firebase/admin';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };
const FINANCE_SESSION = { ...STAFF_SESSION, roles: ['finance'] };
const AGENT_SESSION = { ...STAFF_SESSION, roles: ['agent'] };

const CAMERA = {
  businessId: 'biz-1',
  machineId: 'm-1',
  type: 'mock' as const,
  manufacturer: null,
  model: null,
  serialNumber: null,
  label: 'X',
  status: 'not_configured' as const,
  connectionState: 'disconnected' as const,
  connection: { host: null, port: null, streamPath: null, username: null, passwordEncrypted: null, apiKeyEncrypted: null, onvifProfileToken: null },
  lastSeenAt: null,
  lastHealthCheckAt: null,
  lastHealthOk: null,
  lastErrorMessage: null,
  lastSnapshotAt: null,
  createdAt: { toDate: () => new Date('2024-01-01T00:00:00.000Z') },
  updatedAt: { toDate: () => new Date('2024-01-01T00:00:00.000Z') },
  createdBy: 'staff-1',
  updatedBy: 'staff-1',
  deletedAt: null,
};

beforeEach(async () => {
  vi.clearAllMocks();
  await adminFirestore.recursiveDelete(adminFirestore.collection('auditLogs'));
});

describe('GET /api/vending/machines/[id]/cameras', () => {
  it('401s without a session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await camerasGet(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'm-1' }) });
    expect(response.status).toBe(401);
  });

  it('403s an agent — this is ADMIN_FINANCE_OR_WAREHOUSE territory', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    const response = await camerasGet(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'm-1' }) });
    expect(response.status).toBe(403);
  });

  it('200s the serialized camera list, never leaking connection secrets', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    listByMachineMock.mockResolvedValue([{ id: 'cam-1', data: { ...CAMERA, connection: { ...CAMERA.connection, passwordEncrypted: 'enc:v1:something' } } }]);
    const response = await camerasGet(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'm-1' }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain('enc:v1:something');
    expect(JSON.stringify(body)).not.toMatch(/passwordEncrypted|apiKeyEncrypted/);
  });
});

describe('POST /api/vending/machines/[id]/cameras', () => {
  function post(body: unknown) {
    return camerasPost(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'm-1' }) });
  }

  it('401s without a session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await post({ type: 'mock', label: 'X' });
    expect(response.status).toBe(401);
    expect(registerCameraMock).not.toHaveBeenCalled();
  });

  it('403s a finance-only session — registering a camera is ADMIN_ONLY', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    const response = await post({ type: 'mock', label: 'X' });
    expect(response.status).toBe(403);
  });

  it('400s an invalid type', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await post({ type: 'not-a-real-type', label: 'X' });
    expect(response.status).toBe(400);
    expect(registerCameraMock).not.toHaveBeenCalled();
  });

  it('400s a missing label', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await post({ type: 'mock', label: '  ' });
    expect(response.status).toBe(400);
  });

  it('404s a machine that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    registerCameraMock.mockRejectedValue(new MachineNotFoundError('m-1'));
    const response = await post({ type: 'mock', label: 'X' });
    expect(response.status).toBe(404);
  });

  it('201s, registers, and writes a real audit log entry', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    registerCameraMock.mockResolvedValue('cam-1');
    const response = await post({ type: 'mock', label: 'Dispense area' });
    expect(response.status).toBe(201);
    expect(registerCameraMock).toHaveBeenCalledWith('biz-1', expect.objectContaining({ machineId: 'm-1', type: 'mock', label: 'Dispense area' }), 'staff-1');

    const { logs } = await auditLogRepository.listByBusiness('biz-1');
    expect(logs).toHaveLength(1);
    expect(logs[0].data).toMatchObject({ action: 'register_camera', entityType: 'camera', entityId: 'cam-1', machineId: 'm-1' });
  });
});

describe('PATCH /api/vending/cameras/[cameraId]/configure', () => {
  function patch(body: unknown) {
    return configurePatch(new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ cameraId: 'cam-1' }) });
  }

  it('403s a finance-only session — configuring credentials is ADMIN_ONLY', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    const response = await patch({ password: 'secret' });
    expect(response.status).toBe(403);
  });

  it('never echoes the submitted plaintext password/apiKey back in the response body', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    configureCameraMock.mockResolvedValue(undefined);
    const { cameraRepository } = await import('@/repositories/cameraRepository');
    vi.spyOn(cameraRepository, 'findById').mockResolvedValue({ ...CAMERA, status: 'configured' } as unknown as Awaited<ReturnType<typeof cameraRepository.findById>>);

    const response = await patch({ password: 'super-secret-plaintext', apiKey: 'super-secret-api-key' });
    expect(response.status).toBe(200);
    const bodyText = JSON.stringify(await response.json());
    expect(bodyText).not.toContain('super-secret-plaintext');
    expect(bodyText).not.toContain('super-secret-api-key');
  });

  it('the audit log entry names which fields were set, never their values', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    configureCameraMock.mockResolvedValue(undefined);
    const { cameraRepository } = await import('@/repositories/cameraRepository');
    vi.spyOn(cameraRepository, 'findById').mockResolvedValue({ ...CAMERA, status: 'configured' } as unknown as Awaited<ReturnType<typeof cameraRepository.findById>>);

    await patch({ password: 'super-secret-plaintext', host: '10.0.0.1' });

    const { logs } = await auditLogRepository.listByBusiness('biz-1');
    expect(logs).toHaveLength(1);
    const logText = JSON.stringify(logs[0].data);
    expect(logText).not.toContain('super-secret-plaintext');
    expect((logs[0].data.after as { fieldsSet: string[] }).fieldsSet).toEqual(expect.arrayContaining(['password', 'host']));
  });

  it('404s a camera that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    configureCameraMock.mockRejectedValue(new CameraNotFoundError('cam-1'));
    const response = await patch({});
    expect(response.status).toBe(404);
  });

  it('409s an illegal transition (e.g. reconfiguring an active camera)', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    configureCameraMock.mockRejectedValue(new IllegalCameraTransitionError('active', 'configured'));
    const response = await patch({});
    expect(response.status).toBe(409);
  });
});

describe('POST /api/vending/cameras/[cameraId]/test', () => {
  function post() {
    return testPost(new Request('http://localhost/x', { method: 'POST' }), { params: Promise.resolve({ cameraId: 'cam-1' }) });
  }

  it('401s without a session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    expect((await post()).status).toBe(401);
  });

  it('403s an agent', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    expect((await post()).status).toBe(403);
  });

  it('200s and writes an audit entry either way (success or failure)', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    testConnectionMock.mockResolvedValue({ ok: false, error: 'unreachable' });
    const response = await post();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: false, error: 'unreachable' });

    const { logs } = await auditLogRepository.listByBusiness('biz-1');
    expect(logs).toHaveLength(1);
    expect(logs[0].data.action).toBe('test_camera_connection');
  });

  it('404s a missing camera', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    testConnectionMock.mockRejectedValue(new CameraNotFoundError('cam-1'));
    expect((await post()).status).toBe(404);
  });
});

describe('POST /api/vending/cameras/[cameraId]/health-check', () => {
  function post() {
    return healthCheckPost(new Request('http://localhost/x', { method: 'POST' }), { params: Promise.resolve({ cameraId: 'cam-1' }) });
  }

  it('409s an unsupported capability', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    runHealthCheckMock.mockRejectedValue(new CameraCapabilityNotSupportedError('usb', 'camera_health'));
    expect((await post()).status).toBe(409);
  });

  it('200s and audits', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    runHealthCheckMock.mockResolvedValue({ ok: true, error: null });
    const response = await post();
    expect(response.status).toBe(200);
    const { logs } = await auditLogRepository.listByBusiness('biz-1');
    expect(logs[0].data.action).toBe('camera_health_check');
  });
});

describe('POST /api/vending/cameras/[cameraId]/activate', () => {
  function post() {
    return activatePost(new Request('http://localhost/x', { method: 'POST' }), { params: Promise.resolve({ cameraId: 'cam-1' }) });
  }

  it('403s a finance-only session — ADMIN_ONLY', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    expect((await post()).status).toBe(403);
  });

  it('409s a camera that was never tested', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    activateCameraMock.mockRejectedValue(new CameraNotTestedError('cam-1'));
    expect((await post()).status).toBe(409);
  });

  it('200s and audits', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    activateCameraMock.mockResolvedValue(undefined);
    const response = await post();
    expect(response.status).toBe(200);
    const { logs } = await auditLogRepository.listByBusiness('biz-1');
    expect(logs[0].data).toMatchObject({ action: 'activate_camera', entityType: 'camera', entityId: 'cam-1' });
  });
});

describe('POST /api/vending/cameras/[cameraId]/disable', () => {
  function post() {
    return disablePost(new Request('http://localhost/x', { method: 'POST' }), { params: Promise.resolve({ cameraId: 'cam-1' }) });
  }

  it('403s a finance-only session — ADMIN_ONLY', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    expect((await post()).status).toBe(403);
  });

  it('200s and audits', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    disableCameraMock.mockResolvedValue(undefined);
    const response = await post();
    expect(response.status).toBe(200);
    const { logs } = await auditLogRepository.listByBusiness('biz-1');
    expect(logs[0].data.action).toBe('disable_camera');
  });
});

describe('POST /api/vending/cameras/[cameraId]/snapshot', () => {
  function post(body: unknown = {}) {
    return snapshotPost(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ cameraId: 'cam-1' }) });
  }

  it('401s without a session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    expect((await post()).status).toBe(401);
    expect(captureSnapshotMock).not.toHaveBeenCalled();
  });

  it('defaults reason to admin_test when not given', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    captureSnapshotMock.mockResolvedValue({ id: 'snap-1', data: { businessId: 'biz-1', cameraId: 'cam-1', machineId: 'm-1', transactionId: null, reason: 'admin_test', success: true, storageRef: 'ref', errorMessage: null, metadata: {}, capturedBy: 'staff-1', capturedAt: { toDate: () => new Date() } } });
    await post();
    expect(captureSnapshotMock).toHaveBeenCalledWith('biz-1', expect.objectContaining({ reason: 'admin_test' }));
  });

  it('201s, captures, and audits — success or failure alike', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    captureSnapshotMock.mockResolvedValue({
      id: 'snap-1',
      data: { businessId: 'biz-1', cameraId: 'cam-1', machineId: 'm-1', transactionId: null, reason: 'admin_test', success: false, storageRef: null, errorMessage: 'failed', metadata: {}, capturedBy: 'staff-1', capturedAt: { toDate: () => new Date() } },
    });
    const response = await post({ reason: 'admin_test' });
    expect(response.status).toBe(201);
    const { logs } = await auditLogRepository.listByBusiness('biz-1');
    expect(logs[0].data).toMatchObject({ action: 'capture_camera_snapshot', entityType: 'cameraSnapshot', entityId: 'snap-1', machineId: 'm-1' });
  });

  it('409s an unsupported capability', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    captureSnapshotMock.mockRejectedValue(new CameraCapabilityNotSupportedError('onvif', 'camera_snapshot'));
    expect((await post()).status).toBe(409);
  });
});

describe('GET /api/vending/cameras/[cameraId]/snapshots', () => {
  it('200s the snapshot history', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    listSnapshotsByCameraMock.mockResolvedValue([]);
    const response = await snapshotsGet(new Request('http://localhost/x'), { params: Promise.resolve({ cameraId: 'cam-1' }) });
    expect(response.status).toBe(200);
  });
});

describe('GET /api/vending/cameras/[cameraId]/stream-info', () => {
  it('never returns a credential-bearing field', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    getStreamInfoMock.mockResolvedValue({ available: true, protocol: 'rtsp', host: '10.0.0.1', port: 554, streamPath: '/live' });
    const response = await streamInfoGet(new Request('http://localhost/x'), { params: Promise.resolve({ cameraId: 'cam-1' }) });
    const bodyText = JSON.stringify(await response.json());
    expect(bodyText).not.toMatch(/password|apiKey|username/i);
  });

  it('409s an unsupported capability', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    getStreamInfoMock.mockRejectedValue(new CameraCapabilityNotSupportedError('usb', 'camera_stream'));
    expect((await streamInfoGet(new Request('http://localhost/x'), { params: Promise.resolve({ cameraId: 'cam-1' }) })).status).toBe(409);
  });
});

describe('GET /api/vending/cameras/[cameraId]', () => {
  it('404s a missing camera', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    findByIdMock.mockResolvedValue(null);
    const response = await cameraGet(new Request('http://localhost/x'), { params: Promise.resolve({ cameraId: 'cam-1' }) });
    expect(response.status).toBe(404);
  });

  it('200s the camera plus live diagnostics, never leaking connection secrets', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    findByIdMock.mockResolvedValue({ ...CAMERA, connection: { ...CAMERA.connection, passwordEncrypted: 'enc:v1:abc' } });
    getDiagnosticsMock.mockResolvedValue({ registered: true, capabilities: { camera: true }, statusByCapability: { camera: 'supported', camera_snapshot: 'not_supported', camera_stream: 'not_supported', camera_health: 'not_supported' } });
    const response = await cameraGet(new Request('http://localhost/x'), { params: Promise.resolve({ cameraId: 'cam-1' }) });
    expect(response.status).toBe(200);
    const bodyText = JSON.stringify(await response.json());
    expect(bodyText).not.toContain('enc:v1:abc');
  });
});
