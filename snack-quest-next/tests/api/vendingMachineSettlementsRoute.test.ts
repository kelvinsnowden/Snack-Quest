import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  verifyStaffSessionFromRequestMock,
  listByMachineMock,
  createDraftMock,
  finalizeMock,
  findByIdSettlementMock,
  findByIdMachineMock,
} = vi.hoisted(() => ({
  verifyStaffSessionFromRequestMock: vi.fn(),
  listByMachineMock: vi.fn(),
  createDraftMock: vi.fn(),
  finalizeMock: vi.fn(),
  findByIdSettlementMock: vi.fn(),
  findByIdMachineMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/services/machineSettlementService', async () => {
  const actual = await vi.importActual<typeof import('@/services/machineSettlementService')>('@/services/machineSettlementService');
  return {
    ...actual,
    machineSettlementService: { listByMachine: listByMachineMock, createDraft: createDraftMock, finalize: finalizeMock, findById: findByIdSettlementMock },
  };
});

vi.mock('@/repositories/machineRepository', async () => {
  const actual = await vi.importActual<typeof import('@/repositories/machineRepository')>('@/repositories/machineRepository');
  return { ...actual, machineRepository: { findById: findByIdMachineMock } };
});

import { GET as settlementsGet, POST as settlementsPost } from '@/app/api/vending/machines/[id]/settlements/route';
import { POST as finalizePost } from '@/app/api/vending/settlements/[id]/finalize/route';
import { MachineSettlementNotFoundError, IllegalSettlementTransitionError } from '@/services/machineSettlementService';
import { auditLogRepository } from '@/repositories/auditLogRepository';
import { adminFirestore } from '@/lib/firebase/admin';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };
const FINANCE_SESSION = { ...STAFF_SESSION, roles: ['finance'] };
const AGENT_SESSION = { ...STAFF_SESSION, roles: ['agent'] };

const SETTLEMENT = {
  businessId: 'biz-1',
  machineId: 'm-1',
  partnerId: 'p-1',
  agreementId: null,
  periodStart: { toDate: () => new Date('2024-01-01T00:00:00.000Z') },
  periodEnd: { toDate: () => new Date('2024-01-31T00:00:00.000Z') },
  status: 'draft',
  grossSalesKes: 5000,
  refundsKes: 0,
  operatingCostsKes: null,
  adjustmentKes: 0,
  adjustmentReason: null,
  netDistributableKes: null,
  partnerShareKes: null,
  businessShareKes: null,
  cogsKes: 2000,
  unpricedSaleCount: 0,
  subscriptionChargedKes: 500,
  distributableOwnerKes: 2500,
  finalizedAt: null,
  paidAt: null,
};

beforeEach(async () => {
  vi.clearAllMocks();
  await adminFirestore.recursiveDelete(adminFirestore.collection('auditLogs'));
});

describe('GET /api/vending/machines/[id]/settlements', () => {
  it('401s without a session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await settlementsGet(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'm-1' }) });
    expect(response.status).toBe(401);
  });

  it('200s the serialized settlement history', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    listByMachineMock.mockResolvedValue([{ id: 'settle-1', data: SETTLEMENT }]);
    const response = await settlementsGet(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'm-1' }) });
    const body = await response.json();
    expect(body.settlements).toEqual([
      expect.objectContaining({ id: 'settle-1', grossSalesKes: 5000, cogsKes: 2000, distributableOwnerKes: 2500 }),
    ]);
  });
});

describe('POST /api/vending/machines/[id]/settlements', () => {
  function post(body: unknown) {
    return settlementsPost(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }), {
      params: Promise.resolve({ id: 'm-1' }),
    });
  }

  it('403s a finance-only session — creating a draft settlement is ADMIN_ONLY', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    const response = await post({ periodStart: '2024-01-01T00:00:00.000Z', periodEnd: '2024-01-31T00:00:00.000Z' });
    expect(response.status).toBe(403);
  });

  it('400s invalid dates', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await post({ periodStart: 'not-a-date', periodEnd: '2024-01-31T00:00:00.000Z' });
    expect(response.status).toBe(400);
  });

  it('400s periodEnd before periodStart', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await post({ periodStart: '2024-01-31T00:00:00.000Z', periodEnd: '2024-01-01T00:00:00.000Z' });
    expect(response.status).toBe(400);
  });

  it('404s a machine that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMachineMock.mockResolvedValue(null);
    const response = await post({ periodStart: '2024-01-01T00:00:00.000Z', periodEnd: '2024-01-31T00:00:00.000Z' });
    expect(response.status).toBe(404);
  });

  it('409s a machine with no ownerPartnerId to settle against — never fabricates a partner', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMachineMock.mockResolvedValue({ ownerPartnerId: null });
    const response = await post({ periodStart: '2024-01-01T00:00:00.000Z', periodEnd: '2024-01-31T00:00:00.000Z' });
    expect(response.status).toBe(409);
    expect(createDraftMock).not.toHaveBeenCalled();
  });

  it('201s and creates a draft against the machine’s own ownerPartnerId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMachineMock.mockResolvedValue({ ownerPartnerId: 'p-1' });
    createDraftMock.mockResolvedValue('settle-1');
    const response = await post({ periodStart: '2024-01-01T00:00:00.000Z', periodEnd: '2024-01-31T00:00:00.000Z' });
    expect(response.status).toBe(201);
    expect(createDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-1', machineId: 'm-1', partnerId: 'p-1', actor: 'staff-1' }),
    );
  });
});

describe('POST /api/vending/settlements/[id]/finalize', () => {
  function post() {
    return finalizePost(new Request('http://localhost/x', { method: 'POST' }), { params: Promise.resolve({ id: 'settle-1' }) });
  }

  it('403s a finance-only session — finalizing is the one write that moves money, ADMIN_ONLY', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    const response = await post();
    expect(response.status).toBe(403);
  });

  it('403s a warehouse/agent session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    const response = await post();
    expect(response.status).toBe(403);
  });

  it('200s and finalizes', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdSettlementMock.mockResolvedValueOnce(SETTLEMENT).mockResolvedValueOnce({ ...SETTLEMENT, status: 'finalized' });
    finalizeMock.mockResolvedValue(undefined);
    const response = await post();
    expect(response.status).toBe(200);
    expect(finalizeMock).toHaveBeenCalledWith('biz-1', 'settle-1', 'staff-1');

    const { logs } = await auditLogRepository.listByBusiness('biz-1');
    expect(logs).toHaveLength(1);
    expect(logs[0].data).toMatchObject({ action: 'finalize_settlement', entityType: 'machineSettlement', entityId: 'settle-1', actorId: 'staff-1' });
    expect(logs[0].data.before).toMatchObject({ status: 'draft' });
    expect(logs[0].data.after).toMatchObject({ status: 'finalized' });
  });

  it('404s a settlement that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdSettlementMock.mockResolvedValue(null);
    finalizeMock.mockRejectedValue(new MachineSettlementNotFoundError('settle-1'));
    const response = await post();
    expect(response.status).toBe(404);
  });

  it('409s a settlement already finalized — never double-credits', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdSettlementMock.mockResolvedValue({ ...SETTLEMENT, status: 'finalized' });
    finalizeMock.mockRejectedValue(new IllegalSettlementTransitionError('finalized', 'finalized'));
    const response = await post();
    expect(response.status).toBe(409);
  });
});
