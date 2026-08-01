import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  purchaseOrderService,
  PurchaseOrderNotFoundError,
  InvalidPurchaseOrderTransitionError,
} from '@/services/purchaseOrderService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/** Marks a draft purchase order as ordered (§ Inventory: batches, purchase orders, suppliers, movements, low-stock alerts, expiry, audit trail). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ purchaseOrderId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { purchaseOrderId } = await params;

  try {
    await purchaseOrderService.markOrdered(session.businessId, purchaseOrderId, session.uid);

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'purchase_order.order',
      entityType: 'purchaseOrder',
      entityId: purchaseOrderId,
      after: { status: 'ordered' },
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof PurchaseOrderNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvalidPurchaseOrderTransitionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json({ error: error instanceof Error ? error.message : 'Could not mark this purchase order ordered' }, { status: 400 });
  }
}
