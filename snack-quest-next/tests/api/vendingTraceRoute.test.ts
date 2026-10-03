import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyStaffSessionFromRequestMock, traceMock } = vi.hoisted(() => ({ verifyStaffSessionFromRequestMock: vi.fn(), traceMock: vi.fn() }));

vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock }));
vi.mock('@/services/saleTraceService', () => ({ saleTraceService: { trace: traceMock } }));

import { GET } from '@/app/api/vending/trace/route';

const STAFF = { uid: 'staff-1', email: 's@example.com', displayName: 'S', roles: ['finance'], businessId: 'biz-1' };
const get = (qs: string) => GET(new Request(`http://localhost/api/vending/trace?${qs}`));

beforeEach(() => {
  vi.clearAllMocks();
  verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF);
  traceMock.mockResolvedValue([]);
});

describe('GET /api/vending/trace', () => {
  it('is staff-only, and needs sales.view', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValueOnce(null);
    expect((await get('paymentRef=R1')).status).toBe(401);
    verifyStaffSessionFromRequestMock.mockResolvedValueOnce({ ...STAFF, roles: ['admin'], effectivePermissions: ['machines.view'] });
    const denied = await get('paymentRef=R1');
    expect(denied.status).toBe(403);
    expect((await denied.json()).permission).toBe('sales.view');
    expect(traceMock).not.toHaveBeenCalled();
  });

  it('lets Support trace a sale — their template includes sales.view, for answering customers', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValueOnce({ ...STAFF, roles: ['agent'] });
    expect((await get('paymentRef=R1')).status).toBe(200);
  });

  it('traces by one reference, scoped to the session business', async () => {
    expect((await get('paymentRef=R1')).status).toBe(200);
    expect(traceMock).toHaveBeenCalledWith('biz-1', { paymentRef: 'R1' });
  });

  it('traces by machine and time', async () => {
    await get('machineCode=SQ-1&at=2026-09-27T14:32:00Z&windowMinutes=5');
    expect(traceMock).toHaveBeenCalledWith('biz-1', { machineCode: 'SQ-1', at: new Date('2026-09-27T14:32:00Z'), windowMinutes: 5 });
  });

  it('400s on no reference, two references, or a machine without a valid time', async () => {
    for (const qs of ['', 'paymentRef=R1&transactionId=T1', 'machineCode=SQ-1', 'machineCode=SQ-1&at=yesterday']) {
      expect((await get(qs)).status).toBe(400);
    }
  });
});
