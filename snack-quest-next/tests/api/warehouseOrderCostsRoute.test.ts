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

import { POST as costsRoute } from '@/app/api/warehouse/orders/[orderId]/costs/route';

const SESSION = {
  uid: 'staff-1',
  email: 'boniface@example.com',
  displayName: 'Boniface',
  roles: ['warehouse'],
  businessId: 'biz-1',
  permissions: [],
};

const ORDER = { businessId: 'biz-1', pricing: { totalKes: 5000 } };

function call(body: unknown) {
  return costsRoute(
    new Request('http://localhost/api/warehouse/orders/o1/costs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ orderId: 'o1' }) },
  );
}

/**
 * What a box cost to fulfil, from the person who packed it
 * (§ fulfilment records the real cost).
 */
describe('POST /api/warehouse/orders/[orderId]/costs', () => {
  beforeEach(() => {
    verifyStaffSessionFromRequestMock.mockReset();
    findByIdMock.mockReset().mockResolvedValue(ORDER);
    recordCostsMock.mockReset().mockResolvedValue(undefined);
  });

  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    expect((await call({ goodsCostKes: 100 })).status).toBe(401);
    expect(recordCostsMock).not.toHaveBeenCalled();
  });

  it('403s a role with no fulfilment job', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue({ ...SESSION, roles: ['finance'] });
    expect((await call({ goodsCostKes: 100 })).status).toBe(403);
    expect(recordCostsMock).not.toHaveBeenCalled();
  });

  it('records both figures separately, with who entered them', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SESSION);

    const response = await call({ goodsCostKes: 1800, otherCostKes: 350, note: 'Bolt to Kilimani' });

    expect(response.status).toBe(200);
    expect(recordCostsMock).toHaveBeenCalledWith('o1', {
      goodsCostKes: 1800,
      otherCostKes: 350,
      note: 'Bolt to Kilimani',
      recordedBy: 'staff-1',
      recordedByName: 'Boniface',
    });
  });

  /*
   * The distinction the whole field split exists for. Collapsing these
   * into one number is what makes a margin report unactionable.
   */
  it('accepts one figure without the other', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SESSION);

    await call({ goodsCostKes: 1800 });

    expect(recordCostsMock).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({ goodsCostKes: 1800, otherCostKes: 0 }),
    );
  });

  /*
   * An empty form is not a cost of zero. Writing zero would report an
   * impossible margin, and "nobody has entered it yet" is a different
   * and honest state.
   */
  it('refuses an empty submission rather than saving zero', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SESSION);

    const response = await call({ goodsCostKes: '', otherCostKes: '' });

    expect(response.status).toBe(400);
    expect(recordCostsMock).not.toHaveBeenCalled();
  });

  it('refuses a negative or nonsense figure', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SESSION);

    expect((await call({ goodsCostKes: -5 })).status).toBe(400);
    expect((await call({ goodsCostKes: 'abc' })).status).toBe(400);
    expect(recordCostsMock).not.toHaveBeenCalled();
  });

  /** Another business's order is not this staff member's to price. */
  it('404s an order belonging to a different business', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SESSION);
    findByIdMock.mockResolvedValue({ ...ORDER, businessId: 'other-biz' });

    expect((await call({ goodsCostKes: 100 })).status).toBe(404);
    expect(recordCostsMock).not.toHaveBeenCalled();
  });
});
