import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { orderService } from '@/services/orderService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * `PATCH /api/admin/orders/{orderId}/box` (§ correcting the box on an
 * order) — fixes the wrong box picked while recording a sale by hand.
 *
 * Super admin only. Changing what a paid order is for moves stock and
 * changes what the order is worth, which is the same weight as
 * recording the payment in the first place.
 *
 * The response carries the resulting balance rather than hiding it:
 * the money that arrived does not change because the box did, and a
 * shortfall or overpayment is something a human has to settle.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { orderId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { packageId, quantity } = (body ?? {}) as { packageId?: unknown; quantity?: unknown };
  if (typeof packageId !== 'string' || !packageId) {
    return Response.json({ error: 'packageId is required' }, { status: 400 });
  }
  if (typeof quantity !== 'number') {
    return Response.json({ error: 'quantity must be a number' }, { status: 400 });
  }

  const result = await orderService.changeBox({
    businessId: session.businessId,
    orderId,
    packageId,
    quantity,
    changedByUid: session.uid,
  });

  if (!result.changed) {
    return Response.json({ error: result.reason }, { status: 400 });
  }

  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.uid,
    action: 'order.change_box',
    entityType: 'order',
    entityId: orderId,
    before: { packageLabel: result.before.packageLabel, totalKes: result.before.totalKes },
    after: {
      packageLabel: result.after.packageLabel,
      totalKes: result.after.totalKes,
      amountPaidKes: result.amountPaidKes,
      balanceKes: result.balanceKes,
    },
  });

  return Response.json({
    changed: true,
    totalKes: result.after.totalKes,
    amountPaidKes: result.amountPaidKes,
    balanceKes: result.balanceKes,
  });
}
