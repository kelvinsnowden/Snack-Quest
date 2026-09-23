import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authenticateDeviceMock, listPendingForMachineMock, acknowledgeMock, completeMock } = vi.hoisted(() => ({
  authenticateDeviceMock: vi.fn(),
  listPendingForMachineMock: vi.fn(),
  acknowledgeMock: vi.fn(),
  completeMock: vi.fn(),
}));

vi.mock('@/lib/vending/deviceAuth', () => ({
  authenticateDevice: authenticateDeviceMock,
}));

vi.mock('@/services/machineCommandService', async () => {
  const actual = await vi.importActual<typeof import('@/services/machineCommandService')>('@/services/machineCommandService');
  return {
    ...actual,
    machineCommandService: { listPendingForMachine: listPendingForMachineMock, acknowledge: acknowledgeMock, complete: completeMock },
  };
});

import { GET as commandsGet } from '@/app/api/vending/commands/route';
import { POST as ackPost } from '@/app/api/vending/commands/[id]/ack/route';
import { POST as completePost } from '@/app/api/vending/commands/[id]/complete/route';
import { MachineCommandNotFoundError, IllegalCommandTransitionError } from '@/repositories/machineCommandRepository';
import { CommandExpiredError } from '@/services/machineCommandService';

const COMMAND = {
  businessId: 'biz-1',
  machineId: 'm-1',
  commandRef: 'CMD-ABC12345',
  commandType: 'restart',
  payload: null,
  status: 'acknowledged',
  requestedBy: 'staff-1',
  expiresAt: { toDate: () => new Date('2024-01-01T00:15:00.000Z') },
  acknowledgedAt: { toDate: () => new Date('2024-01-01T00:01:00.000Z') },
  completedAt: null,
  error: null,
  createdAt: { toDate: () => new Date('2024-01-01T00:00:00.000Z') },
};

beforeEach(() => {
  vi.clearAllMocks();
});

function getPending() {
  return commandsGet(new Request('http://localhost/api/vending/commands'));
}

function ack(id = 'cmd-1') {
  return ackPost(new Request(`http://localhost/api/vending/commands/${id}/ack`, { method: 'POST' }), { params: Promise.resolve({ id }) });
}

function complete(body: unknown, id = 'cmd-1') {
  return completePost(
    new Request(`http://localhost/api/vending/commands/${id}/complete`, { method: 'POST', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
}

describe('GET /api/vending/commands', () => {
  it('401s without a valid device credential', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: false, reason: 'missing_header' });
    const response = await getPending();
    expect(response.status).toBe(401);
    expect(listPendingForMachineMock).not.toHaveBeenCalled();
  });

  it("200s the authenticated machine's own pending commands", async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    listPendingForMachineMock.mockResolvedValue([{ id: 'cmd-1', data: { ...COMMAND, status: 'pending' } }]);

    const response = await getPending();
    expect(response.status).toBe(200);
    expect(listPendingForMachineMock).toHaveBeenCalledWith('biz-1', 'm-1');
    const body = await response.json();
    expect(body.commands).toEqual([expect.objectContaining({ id: 'cmd-1', commandType: 'restart' })]);
  });
});

describe('POST /api/vending/commands/[id]/ack', () => {
  it('401s without a valid device credential', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: false, reason: 'unknown_machine' });
    const response = await ack();
    expect(response.status).toBe(401);
    expect(acknowledgeMock).not.toHaveBeenCalled();
  });

  it('404s a command that does not belong to this machine (or does not exist)', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    acknowledgeMock.mockRejectedValue(new MachineCommandNotFoundError('cmd-1'));
    const response = await ack();
    expect(response.status).toBe(404);
  });

  it('410s an expired command', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    acknowledgeMock.mockRejectedValue(new CommandExpiredError('CMD-ABC12345'));
    const response = await ack();
    expect(response.status).toBe(410);
  });

  it('200s and passes the authenticated machineId, never a body value', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    acknowledgeMock.mockResolvedValue(COMMAND);
    const response = await ack();
    expect(response.status).toBe(200);
    expect(acknowledgeMock).toHaveBeenCalledWith('biz-1', 'cmd-1', 'm-1');
  });
});

describe('POST /api/vending/commands/[id]/complete', () => {
  it('401s without a valid device credential', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: false, reason: 'invalid_secret' });
    const response = await complete({ success: true });
    expect(response.status).toBe(401);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('400s a non-boolean success', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    const response = await complete({ success: 'yes' });
    expect(response.status).toBe(400);
  });

  it('404s a command that does not belong to this machine', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    completeMock.mockRejectedValue(new MachineCommandNotFoundError('cmd-1'));
    const response = await complete({ success: true });
    expect(response.status).toBe(404);
  });

  it('409s an illegal transition (e.g. already completed)', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    completeMock.mockRejectedValue(new IllegalCommandTransitionError('completed', 'failed'));
    const response = await complete({ success: false });
    expect(response.status).toBe(409);
  });

  it('200s and forwards success/error to the service with the authenticated machineId', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    completeMock.mockResolvedValue(undefined);
    const response = await complete({ success: false, error: 'watchdog reset failed' });
    expect(response.status).toBe(200);
    expect(completeMock).toHaveBeenCalledWith('biz-1', 'cmd-1', 'm-1', { success: false, error: 'watchdog reset failed' });
  });
});
