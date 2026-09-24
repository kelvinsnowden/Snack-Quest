import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  verifyStaffSessionFromRequestMock,
  findActiveForMachineMock,
  createSubscriptionMock,
  recordPeriodPaymentMock,
  pauseSubscriptionMock,
  resumeSubscriptionMock,
  cancelSubscriptionMock,
} = vi.hoisted(() => ({
  verifyStaffSessionFromRequestMock: vi.fn(),
  findActiveForMachineMock: vi.fn(),
  createSubscriptionMock: vi.fn(),
  recordPeriodPaymentMock: vi.fn(),
  pauseSubscriptionMock: vi.fn(),
  resumeSubscriptionMock: vi.fn(),
  cancelSubscriptionMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/services/machineSubscriptionService', async () => {
  const actual = await vi.importActual<typeof import('@/services/machineSubscriptionService')>('@/services/machineSubscriptionService');
  return {
    ...actual,
    machineSubscriptionService: {
      findActiveForMachine: findActiveForMachineMock,
      createSubscription: createSubscriptionMock,
      recordPeriodPayment: recordPeriodPaymentMock,
      pauseSubscription: pauseSubscriptionMock,
      resumeSubscription: resumeSubscriptionMock,
      cancelSubscription: cancelSubscriptionMock,
    },
  };
});

import { GET as subscriptionGet, POST as subscriptionPost } from '@/app/api/vending/machines/[id]/subscription/route';
import { PATCH as subscriptionPatch } from '@/app/api/vending/machines/[id]/subscription/[subscriptionId]/route';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { MachineAlreadyHasActiveSubscriptionError } from '@/services/machineSubscriptionService';
import { MachineSubscriptionNotFoundError, IllegalSubscriptionTransitionError } from '@/repositories/machineSubscriptionRepository';
import { auditLogRepository } from '@/repositories/auditLogRepository';
import { adminFirestore } from '@/lib/firebase/admin';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };
const FINANCE_SESSION = { ...STAFF_SESSION, roles: ['finance'] };
const AGENT_SESSION = { ...STAFF_SESSION, roles: ['agent'] };

const SUBSCRIPTION = {
  businessId: 'biz-1',
  machineId: 'm-1',
  partnerId: 'p-1',
  planName: 'Standard',
  amountKes: 2000,
  frequency: 'monthly',
  status: 'active',
  startDate: { toDate: () => new Date('2024-01-01T00:00:00.000Z') },
  currentPeriodStart: { toDate: () => new Date('2024-01-01T00:00:00.000Z') },
  currentPeriodEnd: { toDate: () => new Date('2024-01-31T00:00:00.000Z') },
  renewalDate: { toDate: () => new Date('2024-01-31T00:00:00.000Z') },
  lastPaymentStatus: 'unpaid',
  lastPaidAt: null,
  arrearsKes: 0,
  graceUntil: null,
};

beforeEach(async () => {
  vi.clearAllMocks();
  await adminFirestore.recursiveDelete(adminFirestore.collection('auditLogs'));
});

describe('GET /api/vending/machines/[id]/subscription', () => {
  it('401s without a session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await subscriptionGet(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'm-1' }) });
    expect(response.status).toBe(401);
  });

  it('200s null when no active subscription exists', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    findActiveForMachineMock.mockResolvedValue(null);
    const response = await subscriptionGet(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'm-1' }) });
    expect(response.status).toBe(200);
    expect((await response.json()).subscription).toBeNull();
  });

  it('200s the serialized active subscription', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    findActiveForMachineMock.mockResolvedValue({ id: 'sub-1', data: SUBSCRIPTION });
    const response = await subscriptionGet(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'm-1' }) });
    const body = await response.json();
    expect(body.subscription).toEqual(expect.objectContaining({ id: 'sub-1', planName: 'Standard', amountKes: 2000 }));
  });
});

describe('POST /api/vending/machines/[id]/subscription', () => {
  function post(body: unknown) {
    return subscriptionPost(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }), {
      params: Promise.resolve({ id: 'm-1' }),
    });
  }

  it('403s a finance-only session — creating a subscription is ADMIN_ONLY', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    const response = await post({ partnerId: 'p-1', planName: 'Standard', amountKes: 2000, frequency: 'monthly' });
    expect(response.status).toBe(403);
  });

  it('400s a non-positive amountKes', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await post({ partnerId: 'p-1', planName: 'Standard', amountKes: 0, frequency: 'monthly' });
    expect(response.status).toBe(400);
    expect(createSubscriptionMock).not.toHaveBeenCalled();
  });

  it('400s an invalid frequency', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await post({ partnerId: 'p-1', planName: 'Standard', amountKes: 2000, frequency: 'daily' });
    expect(response.status).toBe(400);
  });

  it('201s and creates with a configurable amount — never a hard-coded price', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createSubscriptionMock.mockResolvedValue('sub-1');
    const response = await post({ partnerId: 'p-1', planName: 'Standard', amountKes: 3500, frequency: 'weekly' });
    expect(response.status).toBe(201);
    expect(createSubscriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-1', machineId: 'm-1', partnerId: 'p-1', amountKes: 3500, frequency: 'weekly' }),
    );

    const { logs } = await auditLogRepository.listByBusiness('biz-1');
    expect(logs).toHaveLength(1);
    expect(logs[0].data).toMatchObject({ action: 'create_subscription', entityType: 'machineSubscription', machineId: 'm-1', actorId: 'staff-1' });
    expect(logs[0].data.after).toMatchObject({ machineId: 'm-1', partnerId: 'p-1', amountKes: 3500, frequency: 'weekly' });
  });

  it('404s a machine that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createSubscriptionMock.mockRejectedValue(new MachineNotFoundError('m-1'));
    const response = await post({ partnerId: 'p-1', planName: 'Standard', amountKes: 2000, frequency: 'monthly' });
    expect(response.status).toBe(404);
  });

  it('409s a machine that already has an active subscription', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createSubscriptionMock.mockRejectedValue(new MachineAlreadyHasActiveSubscriptionError('m-1'));
    const response = await post({ partnerId: 'p-1', planName: 'Standard', amountKes: 2000, frequency: 'monthly' });
    expect(response.status).toBe(409);
  });
});

describe('PATCH /api/vending/machines/[id]/subscription/[subscriptionId]', () => {
  function patch(body: unknown) {
    return subscriptionPatch(new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify(body) }), {
      params: Promise.resolve({ id: 'm-1', subscriptionId: 'sub-1' }),
    });
  }

  it('403s a non-admin session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    const response = await patch({ action: 'pause' });
    expect(response.status).toBe(403);
  });

  it('400s an unrecognised action', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await patch({ action: 'explode' });
    expect(response.status).toBe(400);
  });

  it.each([
    ['recordPayment', () => recordPeriodPaymentMock],
    ['pause', () => pauseSubscriptionMock],
    ['resume', () => resumeSubscriptionMock],
    ['cancel', () => cancelSubscriptionMock],
  ] as const)('dispatches action "%s" to the matching service method and writes a real audit log entry', async (action, getMock) => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await patch({ action });
    expect(response.status).toBe(200);
    expect(getMock()).toHaveBeenCalledWith('biz-1', 'sub-1');

    const { logs } = await auditLogRepository.listByBusiness('biz-1');
    expect(logs).toHaveLength(1);
    expect(logs[0].data).toMatchObject({ action: `subscription_${action}`, entityType: 'machineSubscription', machineId: 'm-1', actorId: 'staff-1' });
  });

  it('waivePeriod calls recordPeriodPayment with waived: true', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await patch({ action: 'waivePeriod' });
    expect(response.status).toBe(200);
    expect(recordPeriodPaymentMock).toHaveBeenCalledWith('biz-1', 'sub-1', { waived: true });
  });

  it('404s a subscription that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    pauseSubscriptionMock.mockRejectedValue(new MachineSubscriptionNotFoundError('sub-1'));
    const response = await patch({ action: 'pause' });
    expect(response.status).toBe(404);
  });

  it('409s an illegal transition', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    cancelSubscriptionMock.mockRejectedValue(new IllegalSubscriptionTransitionError('cancelled', 'cancelled'));
    const response = await patch({ action: 'cancel' });
    expect(response.status).toBe(409);
  });
});
