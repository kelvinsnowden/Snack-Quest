import { hasStaffRole, ADMIN_ONLY, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { orderRepository } from '@/repositories/orderRepository';
import { publishEvent } from '@/lib/events/eventBus';
import { splitEvenly } from '@/lib/orders/splitCost';

/**
 * Costs recorded against several orders at once, after the fact
 * (§ fulfilment records the real cost).
 *
 * Exists because the per-order box lives on the warehouse queue, and a
 * delivered order has left that queue — so the moment the job is
 * finished is exactly the moment the cost could no longer be entered.
 * This is the way back.
 *
 * **`allocation` is the whole reason this is not a loop over the
 * single-order route.** Selecting five orders and typing 800 means one
 * of two completely different things: eight hundred spent on each, or
 * eight hundred spent across all five. Guessing either way is a
 * five-fold error in every margin figure downstream, so the caller has
 * to say which, and the client shows the resulting per-order number
 * before anything is written.
 *
 * `split` divides evenly and gives the remainder to the first orders,
 * a shilling each, so the parts always add back to exactly the total
 * that was spent. Dropping a remainder would quietly under-report.
 */
const MAX_COST_KES = 10_000_000;
const MAX_ORDERS_PER_CALL = 100;

function readAmount(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return 0;
  }
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_COST_KES) {
    return null;
  }
  return Math.round(amount);
}

export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const raw = (body ?? {}) as {
    orderIds?: unknown;
    goodsCostKes?: unknown;
    otherCostKes?: unknown;
    allocation?: unknown;
    note?: unknown;
  };

  const orderIds = Array.isArray(raw.orderIds)
    ? raw.orderIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  if (orderIds.length === 0) {
    return Response.json({ error: 'Choose at least one order.' }, { status: 400 });
  }
  if (orderIds.length > MAX_ORDERS_PER_CALL) {
    return Response.json(
      { error: `That is more than ${MAX_ORDERS_PER_CALL} orders at once.` },
      { status: 400 },
    );
  }

  if (raw.allocation !== 'each' && raw.allocation !== 'split') {
    return Response.json(
      { error: 'Say whether the amount is per order or split across them.' },
      { status: 400 },
    );
  }
  const allocation = raw.allocation;

  const goodsCostKes = readAmount(raw.goodsCostKes);
  const otherCostKes = readAmount(raw.otherCostKes);
  if (goodsCostKes === null || otherCostKes === null) {
    return Response.json(
      { error: 'Costs must be whole shillings, zero or more.' },
      { status: 400 },
    );
  }
  if (goodsCostKes === 0 && otherCostKes === 0) {
    return Response.json(
      { error: 'Enter what these orders cost. Leave this until you know, rather than saving zero.' },
      { status: 400 },
    );
  }

  const note = typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim().slice(0, 500) : null;

  /*
   * Every order is read and checked for tenancy before anything is
   * written. A partial write across a tenancy boundary would be worse
   * than a refusal, and one bad id in a list of fifty is far more
   * likely than a deliberate attack.
   */
  const orders = await Promise.all(orderIds.map((id) => orderRepository.findById(id)));
  const missing = orderIds.filter(
    (_, index) => !orders[index] || orders[index]!.businessId !== session.businessId,
  );
  if (missing.length > 0) {
    return Response.json(
      { error: `${missing.length} of those orders could not be found.` },
      { status: 404 },
    );
  }

  const goodsShare =
    allocation === 'split' ? splitEvenly(goodsCostKes, orderIds.length) : orderIds.map(() => goodsCostKes);
  const otherShare =
    allocation === 'split' ? splitEvenly(otherCostKes, orderIds.length) : orderIds.map(() => otherCostKes);

  await Promise.all(
    orderIds.map((orderId, index) =>
      orderRepository.recordCosts(orderId, {
        goodsCostKes: goodsShare[index],
        otherCostKes: otherShare[index],
        note,
        recordedBy: session.uid,
        recordedByName: session.displayName || session.email || session.uid,
      }),
    ),
  );

  await publishEvent(session.businessId, 'OrderCostsRecordedInBulk', 'order', orderIds[0], {
    orderCount: orderIds.length,
    allocation,
    goodsCostKes,
    otherCostKes,
    recordedBy: session.uid,
  });

  return Response.json({
    ok: true,
    orderCount: orderIds.length,
    allocation,
    perOrderGoodsKes: goodsShare,
    perOrderOtherKes: otherShare,
  });
}
