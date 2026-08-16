import {
  hasStaffRole,
  ADMIN_ONLY,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  purchaseOrderService,
  PurchaseOrderNotFoundError,
  InvalidPurchaseOrderTransitionError,
} from '@/services/purchaseOrderService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

interface ReceiveBody {
  /** Real expiry (YYYY-MM-DD) read off the physical delivery, keyed by packageId — see `PurchaseOrderService.receivePurchaseOrder`'s doc comment. */
  expiresAtByPackageId?: unknown;
}

/** Receives an ordered purchase order — creates the real batches, movements, and stock increments (§ Inventory: batches, purchase orders, suppliers, movements, low-stock alerts, expiry, audit trail). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ purchaseOrderId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const { purchaseOrderId } = await params;

  let expiresAtByPackageId: Record<string, string | null> = {};
  try {
    const body = (await request.json().catch(() => null)) as ReceiveBody | null;
    if (body?.expiresAtByPackageId !== undefined) {
      if (
        typeof body.expiresAtByPackageId !== 'object' ||
        body.expiresAtByPackageId === null
      ) {
        return Response.json(
          { error: '"expiresAtByPackageId" must be an object when provided.' },
          { status: 400 },
        );
      }
      for (const [packageId, value] of Object.entries(
        body.expiresAtByPackageId as Record<string, unknown>,
      )) {
        if (value !== null && typeof value !== 'string') {
          return Response.json(
            {
              error: `"expiresAtByPackageId.${packageId}" must be a string or null.`,
            },
            { status: 400 },
          );
        }
        expiresAtByPackageId[packageId] = value as string | null;
      }
    }
  } catch {
    expiresAtByPackageId = {};
  }

  try {
    await purchaseOrderService.receivePurchaseOrder(
      session.businessId,
      purchaseOrderId,
      session.uid,
      expiresAtByPackageId,
    );

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'purchase_order.receive',
      entityType: 'purchaseOrder',
      entityId: purchaseOrderId,
      after: { status: 'received' },
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof PurchaseOrderNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvalidPurchaseOrderTransitionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not receive this purchase order',
      },
      { status: 400 },
    );
  }
}
