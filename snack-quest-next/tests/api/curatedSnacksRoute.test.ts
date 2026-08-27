import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifySessionMock, findByIdMock, recordMock, findManyByIdMock } = vi.hoisted(() => ({
  verifySessionMock: vi.fn(),
  findByIdMock: vi.fn(),
  recordMock: vi.fn(),
  findManyByIdMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: verifySessionMock }));
vi.mock('@/repositories/orderRepository', () => ({
  orderRepository: { findById: findByIdMock, recordCuratedSnacks: recordMock },
}));
vi.mock('@/repositories/snackItemRepository', () => ({
  snackItemRepository: { findManyById: findManyByIdMock },
}));
vi.mock('@/lib/events/eventBus', () => ({ publishEvent: vi.fn() }));

import { POST as curatedRoute } from '@/app/api/warehouse/orders/[orderId]/curated-snacks/route';

const SESSION = {
  uid: 'staff-1',
  email: 'boniface@snackquest.co',
  displayName: 'Boniface',
  roles: ['warehouse'],
  businessId: 'biz-1',
  permissions: [],
};

const PROMISED = [
  { snackItemId: 'a', name: 'D 2', origin: 'Korea', imageUrl: null },
  { snackItemId: 'b', name: 'SK 12', origin: 'Korea', imageUrl: null },
];

function order(overrides: Record<string, unknown> = {}) {
  return {
    businessId: 'biz-1',
    product: {
      packageId: 'premium',
      packageLabel: 'Premium Box',
      quantity: 1,
      unitPriceKes: 5000,
      guaranteedPicks: PROMISED,
    },
    ...overrides,
  };
}

function snack(id: string, name: string, extra: Record<string, unknown> = {}) {
  return [
    id,
    {
      businessId: 'biz-1',
      name,
      origin: 'Korea',
      imageUrl: null,
      isActive: true,
      availableForPremiumSelection: false,
      ...extra,
    },
  ] as const;
}

function call(body: unknown) {
  return curatedRoute(
    new Request('http://localhost/api/warehouse/orders/o1/curated-snacks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ orderId: 'o1' }) },
  );
}

/**
 * The rest of what went in each box (§ staff complete the box).
 *
 * The property under test throughout is that the customer's own picks
 * survive untouched. Five snacks chosen at checkout are a promise, and
 * an endpoint that could quietly rewrite or absorb them would turn
 * "guaranteed" into "whatever we happened to put in".
 */
describe('POST /api/warehouse/orders/[orderId]/curated-snacks', () => {
  beforeEach(() => {
    verifySessionMock.mockReset().mockResolvedValue(SESSION);
    findByIdMock.mockReset().mockResolvedValue(order());
    recordMock.mockReset().mockResolvedValue(undefined);
    findManyByIdMock
      .mockReset()
      .mockResolvedValue(new Map([snack('c', 'N17'), snack('d', 'SK 9')]));
  });

  it('401s without a staff session', async () => {
    verifySessionMock.mockResolvedValue(null);
    expect((await call({ lines: [] })).status).toBe(401);
  });

  it('403s a role with no fulfilment job', async () => {
    verifySessionMock.mockResolvedValue({ ...SESSION, roles: ['finance'] });
    expect((await call({ lines: [] })).status).toBe(403);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('records the added snacks beside the promise, not instead of it', async () => {
    const response = await call({ lines: [{ lineIndex: 0, snackItemIds: ['c', 'd'] }] });

    expect(response.status).toBe(200);
    const [, items] = recordMock.mock.calls[0];
    expect(items[0].curatedSnacks.map((s: { name: string }) => s.name)).toEqual(['N17', 'SK 9']);
    // The whole point: what the customer chose is still there, intact.
    expect(items[0].guaranteedPicks).toEqual(PROMISED);
  });

  /*
   * Re-read from the live catalogue rather than trusted, exactly as a
   * customer's own picks are. A packer cannot put a snack in a box by
   * naming an id that no longer exists.
   */
  it('refuses a snack the catalogue does not have', async () => {
    findManyByIdMock.mockResolvedValue(new Map([snack('c', 'N17')]));

    const response = await call({ lines: [{ lineIndex: 0, snackItemIds: ['c', 'gone'] }] });

    expect(response.status).toBe(400);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('names the box in the error, so a two-box order says which', async () => {
    findManyByIdMock.mockResolvedValue(new Map());

    const response = await call({ lines: [{ lineIndex: 0, snackItemIds: ['gone'] }] });
    const body = (await response.json()) as { error: string };

    expect(body.error).toMatch(/Premium Box/);
  });

  it('refuses a line index that is not on the order', async () => {
    expect((await call({ lines: [{ lineIndex: 4, snackItemIds: ['c'] }] })).status).toBe(400);
    expect(recordMock).not.toHaveBeenCalled();
  });

  /** Another business's order is not this packer's to fill. */
  it('404s an order belonging to a different business', async () => {
    findByIdMock.mockResolvedValue(order({ businessId: 'other-biz' }));
    expect((await call({ lines: [{ lineIndex: 0, snackItemIds: ['c'] }] })).status).toBe(404);
  });

  /*
   * Clearing is a real action — a packer who added the wrong snack has
   * to be able to take it back out.
   */
  it('lets an empty list clear what was recorded', async () => {
    const response = await call({ lines: [{ lineIndex: 0, snackItemIds: [] }] });

    expect(response.status).toBe(200);
    const [, items] = recordMock.mock.calls[0];
    expect(items[0].curatedSnacks).toEqual([]);
    expect(items[0].guaranteedPicks).toEqual(PROMISED);
  });

  /*
   * Staff packing rules, not the website's. A snack nobody opted into
   * customer selection is still something the shop can put in a box.
   */
  it('accepts a snack no customer is allowed to choose', async () => {
    findManyByIdMock.mockResolvedValue(
      new Map([snack('c', 'Bulk sugar', { availableForPremiumSelection: false })]),
    );

    const response = await call({ lines: [{ lineIndex: 0, snackItemIds: ['c'] }] });

    expect(response.status).toBe(200);
  });
});
