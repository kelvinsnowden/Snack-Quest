import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyStaffSessionFromRequestMock, issueCommandMock, listHistoryForMachineMock } = vi.hoisted(() => ({
  verifyStaffSessionFromRequestMock: vi.fn(),
  issueCommandMock: vi.fn(),
  listHistoryForMachineMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/services/machineCommandService', async () => {
  const actual = await vi.importActual<typeof import('@/services/machineCommandService')>('@/services/machineCommandService');
  return {
    ...actual,
    machineCommandService: { issueCommand: issueCommandMock, listHistoryForMachine: listHistoryForMachineMock },
  };
});

import { GET as commandsGet, POST as commandsPost } from '@/app/api/vending/machines/[id]/commands/route';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { CommandNotSupportedError } from '@/services/machineCommandService';
import { auditLogRepository } from '@/repositories/auditLogRepository';
import { adminFirestore } from '@/lib/firebase/admin';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };
const WAREHOUSE_SESSION = { ...STAFF_SESSION, roles: ['warehouse'] };
const AGENT_SESSION = { ...STAFF_SESSION, roles: ['agent'] };

const COMMAND = {
  businessId: 'biz-1',
  machineId: 'm-1',
  commandRef: 'CMD-ABC12345',
  commandType: 'restart',
  payload: null,
  status: 'pending',
  requestedBy: 'staff-1',
  expiresAt: { toDate: () => new Date('2024-01-01T00:15:00.000Z') },
  acknowledgedAt: null,
  completedAt: null,
  error: null,
  createdAt: { toDate: () => new Date('2024-01-01T00:00:00.000Z') },
};

beforeEach(async () => {
  vi.clearAllMocks();
  await adminFirestore.recursiveDelete(adminFirestore.collection('auditLogs'));
});

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/vending/machines/m-1/commands', { method: 'POST', body: JSON.stringify(body) });
}

function getCommands(id = 'm-1') {
  return commandsGet(new Request('http://localhost/api/vending/machines/m-1/commands'), { params: Promise.resolve({ id }) });
}

function postCommand(body: unknown, id = 'm-1') {
  return commandsPost(postRequest(body), { params: Promise.resolve({ id }) });
}

describe('POST /api/vending/machines/[id]/commands', () => {
  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await postCommand({ commandType: 'restart' });
    expect(response.status).toBe(401);
    expect(issueCommandMock).not.toHaveBeenCalled();
  });

  it('403s a staff session outside admin/warehouse', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    const response = await postCommand({ commandType: 'restart' });
    expect(response.status).toBe(403);
  });

  it('400s an unrecognised commandType', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await postCommand({ commandType: 'launch_missiles' });
    expect(response.status).toBe(400);
    expect(issueCommandMock).not.toHaveBeenCalled();
  });

  it('201s and calls the service with the staff uid as requestedBy', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(WAREHOUSE_SESSION);
    issueCommandMock.mockResolvedValue({ commandId: 'cmd-1', commandRef: 'CMD-ABC12345' });

    const response = await postCommand({ commandType: 'restart' });
    expect(response.status).toBe(201);
    expect(issueCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-1', machineId: 'm-1', commandType: 'restart', requestedBy: 'staff-1' }),
    );

    const { logs } = await auditLogRepository.listByBusiness('biz-1');
    expect(logs).toHaveLength(1);
    expect(logs[0].data).toMatchObject({ action: 'issue_machine_command', entityType: 'machineCommand', machineId: 'm-1', actorId: 'staff-1' });
    expect(logs[0].data.after).toMatchObject({ machineId: 'm-1', commandType: 'restart' });
  });

  it('404s a machine that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    issueCommandMock.mockRejectedValue(new MachineNotFoundError('m-1'));
    const response = await postCommand({ commandType: 'restart' });
    expect(response.status).toBe(404);
  });

  it('409s a command the machine\'s adapter does not support', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    issueCommandMock.mockRejectedValue(new CommandNotSupportedError('shengma', 'restart'));
    const response = await postCommand({ commandType: 'restart' });
    expect(response.status).toBe(409);
  });
});

describe('GET /api/vending/machines/[id]/commands', () => {
  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await getCommands();
    expect(response.status).toBe(401);
  });

  it('200s a serialized command history', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    listHistoryForMachineMock.mockResolvedValue({ commands: [{ id: 'cmd-1', data: COMMAND }], nextCursor: null });

    const response = await getCommands();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.commands).toEqual([
      expect.objectContaining({ id: 'cmd-1', commandRef: 'CMD-ABC12345', status: 'pending' }),
    ]);
  });
});
