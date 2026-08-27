import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyStaffSessionFromRequestMock, findByIdMock, recordCostsMock } = vi.hoisted(() => ({
  verifyStaffSessionFromRequestMock: vi.fn(),
  findByIdMock: vi.fn(),
  recordCostsMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));
vi.mock('@/repositories/orderRepository', () => ({
  orderRepository: { findById: findByIdMock, recordCosts: recordCostsMock },
}));
vi.mock('@/lib/events/eventBus', () => ({ publishEvent: vi.fn() }));

import { POST as bulkRoute } from '@/app/api/admin/orders/costs/bulk/route';
import { splitEvenly } from '@/lib/orders/splitCost';

const SESSION = {
  uid: 'staff-1',
  email: 'boss@snackquest.co',
  displayName: 'Boss',
  roles: ['super_admin'],
  businessId: 'biz-1',
  permissions: [],
};

function call(body: unknown) {
  return bulkRoute(
    new Request('http://localhost/api/admin/orders/costs/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

/**
 * Splitting a spend across the orders it covers
 * (§ fulfilment records the real cost).
 *
 * The arithmetic is the part worth testing: a remainder dropped on the
 * floor under-reports what the business actually spent, quietly and
 * forever.
 */
describe('splitting a total across orders', () => {
  it('adds back to exactly the amount spent', () => {
    for (const [total, count] of [
      [800, 5],
      [1000, 3],
      [1, 4],
      [7, 7],
      [12345, 7],
      [0, 3],
    ] as const) {
      const parts = splitEvenly(total, count);
      expect(parts).toHaveLength(count);
      expect(parts.reduce((sum, part) => sum + part, 0)).toBe(total);
      expect(parts.every((part) => Number.isInteger(part) && part >= 0)).toBe(true);
    }
  });

  it('spreads a remainder rather than dropping it', () => {
    // 1000 over 3 is 333.33 each; the parts must still total 1000.
    expect(splitEvenly(1000, 3)).toEqual([334, 333, 333]);
  });
});

describe('POST /api/admin/orders/costs/bulk', () => {
  beforeEach(() => {
    verifyStaffSessionFromRequestMock.mockReset().mockResolvedValue(SESSION);
    findByIdMock.mockReset().mockResolvedValue({ businessId: 'biz-1', pricing: { totalKes: 5000 } });
    recordCostsMock.mockReset().mockResolvedValue(undefined);
  });

  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    expect((await call({ orderIds: ['o1'], goodsCostKes: 100, allocation: 'each' })).status).toBe(401);
  });

  it('403s a role that is not admin', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue({ ...SESSION, roles: ['warehouse'] });
    expect((await call({ orderIds: ['o1'], goodsCostKes: 100, allocation: 'each' })).status).toBe(403);
    expect(recordCostsMock).not.toHaveBeenCalled();
  });

  /*
   * The distinction the whole endpoint exists for. Getting it wrong is
   * a five-fold error in every margin figure downstream, so it is
   * required rather than defaulted.
   */
  it('refuses a request that does not say how to allocate', async () => {
    const response = await call({ orderIds: ['o1', 'o2'], goodsCostKes: 800 });
    expect(response.status).toBe(400);
    expect(recordCostsMock).not.toHaveBeenCalled();
  });

  it('splits a total across the selected orders', async () => {
    await call({ orderIds: ['o1', 'o2', 'o3'], goodsCostKes: 1000, allocation: 'split' });

    const amounts = recordCostsMock.mock.calls.map(([, costs]) => costs.goodsCostKes);
    expect(amounts).toEqual([334, 333, 333]);
    expect(amounts.reduce((sum, a) => sum + a, 0)).toBe(1000);
  });

  it('records the full amount against each order when told to', async () => {
    await call({ orderIds: ['o1', 'o2', 'o3'], goodsCostKes: 1000, allocation: 'each' });

    const amounts = recordCostsMock.mock.calls.map(([, costs]) => costs.goodsCostKes);
    expect(amounts).toEqual([1000, 1000, 1000]);
  });

  it('keeps the two kinds of cost apart when splitting', async () => {
    await call({
      orderIds: ['o1', 'o2'],
      goodsCostKes: 900,
      otherCostKes: 300,
      allocation: 'split',
    });

    expect(recordCostsMock).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({ goodsCostKes: 450, otherCostKes: 150 }),
    );
  });

  it('refuses an empty submission rather than saving zero', async () => {
    const response = await call({ orderIds: ['o1'], goodsCostKes: '', otherCostKes: '', allocation: 'each' });
    expect(response.status).toBe(400);
    expect(recordCostsMock).not.toHaveBeenCalled();
  });

  it('refuses an empty selection', async () => {
    expect((await call({ orderIds: [], goodsCostKes: 100, allocation: 'each' })).status).toBe(400);
  });

  /*
   * Checked before anything is written. A partial write that crossed a
   * tenancy boundary would be worse than a refusal, and one bad id in
   * a list of fifty is far likelier than an attack.
   */
  it('writes nothing at all when one order belongs to another business', async () => {
    findByIdMock.mockImplementation(async (id: string) =>
      id === 'o2' ? { businessId: 'other-biz', pricing: { totalKes: 1 } } : { businessId: 'biz-1', pricing: { totalKes: 1 } },
    );

    const response = await call({ orderIds: ['o1', 'o2', 'o3'], goodsCostKes: 900, allocation: 'split' });

    expect(response.status).toBe(404);
    expect(recordCostsMock).not.toHaveBeenCalled();
  });
});
