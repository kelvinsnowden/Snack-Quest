import {
  hasStaffRole,
  ADMIN_OR_WAREHOUSE,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { orderRepository } from '@/repositories/orderRepository';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { validateGuaranteedPicks, MAX_STAFF_PICKS } from '@/lib/packages/guaranteedPicks';
import { orderLines } from '@/types/checkoutLine';
import { publishEvent } from '@/lib/events/eventBus';

/**
 * The rest of what went in each box, recorded by the shop
 * (§ staff complete the box).
 *
 * A Premium box holds far more than the five snacks a customer may
 * choose. Those five are a promise made at checkout; everything else
 * is curation, and it is only knowable once somebody is standing over
 * the box. This is where that gets written down.
 *
 * `guaranteedPicks` is never touched. The customer's promise is not
 * this endpoint's to edit — it is copied through untouched on every
 * line, and the curated snacks are stored beside it so the two can
 * always be told apart.
 *
 * Every snack id is re-read from the live catalogue rather than
 * trusted, exactly as the customer's own picks are. Staff packing
 * rules apply (§ staff are not picking, they are packing): any number,
 * from anything the shop actually has, rather than the website's
 * exactly-five-from-the-opted-in-list.
 */
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

  /*
   * Keyed by line index rather than package id: an order may hold two
   * lines of the same box, and they are allowed different contents.
   */
  const raw = (body as { lines?: unknown } | null)?.lines;
  if (!Array.isArray(raw)) {
    return Response.json({ error: 'Send the snacks for each box.' }, { status: 400 });
  }

  /*
   * `orderLines` reconstructs the single line of an order placed
   * before line items existed, and that reconstruction carries no
   * picks — they live at the top of `product` on those orders. Writing
   * the line back without them would leave the promise and the
   * curation for one box sitting in two different places.
   *
   * So the first line inherits them, which is also exactly how an
   * order created today stores it: line-level, with the same list
   * mirrored at the top for readers that predate lines.
   */
  const lines = orderLines(order.product).map((line, index) =>
    index === 0 && !line.guaranteedPicks?.length && order.product.guaranteedPicks?.length
      ? { ...line, guaranteedPicks: order.product.guaranteedPicks }
      : line,
  );
  const wanted = new Map<number, string[]>();
  for (const entry of raw) {
    const index = (entry as { lineIndex?: unknown })?.lineIndex;
    const ids = (entry as { snackItemIds?: unknown })?.snackItemIds;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= lines.length) {
      return Response.json({ error: 'That box is not on this order.' }, { status: 400 });
    }
    wanted.set(
      index,
      Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && id.length > 0) : [],
    );
  }

  // Per box, not across the order: each box has its own ceiling.
  for (const ids of wanted.values()) {
    if (ids.length > MAX_STAFF_PICKS) {
      return Response.json(
        { error: `A box can hold at most ${MAX_STAFF_PICKS} named snacks.` },
        { status: 400 },
      );
    }
  }

  const allIds = [...wanted.values()].flat();
  const catalogue = allIds.length
    ? await snackItemRepository.findManyById([...new Set(allIds)])
    : new Map();

  /*
   * Validated into a plain result rather than thrown out of a `map`,
   * so a snack that has gone out of stock comes back as a 400 the
   * packer can read instead of a 500 that says nothing.
   */
  const updated = [];
  for (const [index, line] of lines.entries()) {
    if (!wanted.has(index)) {
      updated.push(line);
      continue;
    }
    // `guaranteedPickCount: 0` because staff packing ignores it —
    // there is no target number for the curated remainder.
    const result = validateGuaranteedPicks(
      session.businessId,
      { guaranteedPickCount: 0 },
      wanted.get(index)!,
      catalogue,
      { staffPacking: true },
    );
    if (!result.ok) {
      return Response.json(
        { error: `${line.packageLabel}: ${result.reason}` },
        { status: 400 },
      );
    }
    updated.push({ ...line, curatedSnacks: result.picks });
  }

  await orderRepository.recordCuratedSnacks(orderId, updated, session.uid);

  await publishEvent(session.businessId, 'OrderCuratedSnacksRecorded', 'order', orderId, {
    recordedBy: session.uid,
    snackCount: allIds.length,
  });

  return Response.json({ ok: true, snackCount: allIds.length });
}
