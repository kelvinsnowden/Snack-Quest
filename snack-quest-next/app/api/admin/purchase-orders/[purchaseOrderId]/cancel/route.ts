import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  purchaseOrderService,
  PurchaseOrderNotFoundError,
  InvalidPurchaseOrderTransitionError,
} from '@/services/purchaseOrderService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/** Cancels a draft or ordered purchase order (§ Inventory: batches, purchase orders, suppliers, movements, low-stock alerts, expiry, audit trail). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ purchaseOrderId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { purchaseOrderId } = await params;

  let reason: string | undefined;
  try {
    const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
    if (body?.reason !== undefined) {
      if (typeof body.reason !== 'string') {
        return Response.json({ error: '"reason" must be a string when provided.' }, { status: 400 });
      }
      reason = body.reason;
    }
  } catch {
    // No body — cancellation reason is optional.
  }

  try {
    await purchaseOrderService.cancelPurchaseOrder(session.businessId, purchaseOrderId, session.uid, reason);

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'purchase_order.cancel',
      entityType: 'purchaseOrder',
      entityId: purchaseOrderId,
      after: { status: 'cancelled', reason: reason ?? null },
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof PurchaseOrderNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvalidPurchaseOrderTransitionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json({ error: error instanceof Error ? error.message : 'Could not cancel this purchase order' }, { status: 400 });
  }
}
