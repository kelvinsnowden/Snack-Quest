import {
  hasStaffRole,
  ADMIN_OR_WAREHOUSE,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { orderRepository } from '@/repositories/orderRepository';
import { publishEvent } from '@/lib/events/eventBus';

/**
 * What this box really cost to fulfil, from the person who packed it
 * (§ fulfilment records the real cost).
 *
 * Under `/api/warehouse` rather than `/api/admin` because it belongs
 * to that workspace's own job — the packer is the only person who
 * knows what the snacks and the Bolt actually came to.
 *
 * Both figures are optional individually but at least one must be
 * present: a submission with neither is not a cost record, it is an
 * empty form, and silently writing zeroes would report an impossible
 * margin later.
 */
const MAX_COST_KES = 10_000_000;

function readAmount(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return 0;
  }
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_COST_KES) {
    return null;
  }
  // Whole shillings. A fractional cost is a typo, not a price.
  return Math.round(amount);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { orderId } = await params;
  const order = await orderRepository.findById(orderId);
  if (!order || order.businessId !== session.businessId) {
    return Response.json({ error: 'Order not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const raw = (body ?? {}) as {
    goodsCostKes?: unknown;
    otherCostKes?: unknown;
    note?: unknown;
  };
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
      { error: 'Enter what the box cost. Leave this until you know, rather than saving zero.' },
      { status: 400 },
    );
  }

  const note = typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim().slice(0, 500) : null;

  await orderRepository.recordCosts(orderId, {
    goodsCostKes,
    otherCostKes,
    note,
    recordedBy: session.uid,
    recordedByName: session.displayName || session.email || session.uid,
  });

  await publishEvent(session.businessId, 'OrderCostsRecorded', 'order', orderId, {
    goodsCostKes,
    otherCostKes,
    recordedBy: session.uid,
    // The margin this implies, recorded alongside so a later report
    // does not have to re-derive it from a price that may since have
    // been corrected.
    revenueKes: order.pricing.totalKes,
  });

  return Response.json({ ok: true, goodsCostKes, otherCostKes });
}
