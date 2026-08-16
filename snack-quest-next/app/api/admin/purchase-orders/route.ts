import {
  hasStaffRole,
  ADMIN_ONLY,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  purchaseOrderService,
  InvalidPurchaseOrderInputError,
} from '@/services/purchaseOrderService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

interface CreatePurchaseOrderBody {
  supplierId?: unknown;
  lineItems?: unknown;
  expectedDeliveryAt?: unknown;
  notes?: unknown;
}

interface LineItemBody {
  packageId?: unknown;
  quantity?: unknown;
  unitCostKes?: unknown;
}

function validateLineItems(
  raw: unknown,
):
  | { error: string }
  | {
      lineItems: { packageId: string; quantity: number; unitCostKes: number }[];
    } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: '"lineItems" must be a non-empty array.' };
  }
  const lineItems: {
    packageId: string;
    quantity: number;
    unitCostKes: number;
  }[] = [];
  for (const raw_item of raw) {
    const item = raw_item as LineItemBody;
    if (typeof item.packageId !== 'string' || !item.packageId) {
      return { error: 'Each line item requires a "packageId".' };
    }
    if (typeof item.quantity !== 'number') {
      return { error: 'Each line item requires a numeric "quantity".' };
    }
    if (typeof item.unitCostKes !== 'number') {
      return { error: 'Each line item requires a numeric "unitCostKes".' };
    }
    lineItems.push({
      packageId: item.packageId,
      quantity: item.quantity,
      unitCostKes: item.unitCostKes,
    });
  }
  return { lineItems };
}

/** Creates a draft purchase order (§ Inventory: batches, purchase orders, suppliers, movements, low-stock alerts, expiry, audit trail). */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  let body: CreatePurchaseOrderBody;
  try {
    body = (await request.json()) as CreatePurchaseOrderBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (typeof body.supplierId !== 'string' || !body.supplierId) {
    return Response.json(
      { error: '"supplierId" is required.' },
      { status: 400 },
    );
  }
  const lineItemsResult = validateLineItems(body.lineItems);
  if ('error' in lineItemsResult) {
    return Response.json({ error: lineItemsResult.error }, { status: 400 });
  }
  if (
    body.expectedDeliveryAt !== undefined &&
    body.expectedDeliveryAt !== null &&
    typeof body.expectedDeliveryAt !== 'string'
  ) {
    return Response.json(
      {
        error:
          '"expectedDeliveryAt" must be a date string or null when provided.',
      },
      { status: 400 },
    );
  }
  if (body.notes !== undefined && typeof body.notes !== 'string') {
    return Response.json(
      { error: '"notes" must be a string when provided.' },
      { status: 400 },
    );
  }

  try {
    const purchaseOrderId = await purchaseOrderService.createPurchaseOrder(
      session.businessId,
      {
        supplierId: body.supplierId,
        lineItems: lineItemsResult.lineItems,
        expectedDeliveryAt: body.expectedDeliveryAt as
          string | null | undefined,
        notes: body.notes as string | undefined,
      },
      session.uid,
    );

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'purchase_order.create',
      entityType: 'purchaseOrder',
      entityId: purchaseOrderId,
      after: {
        supplierId: body.supplierId,
        lineItemCount: lineItemsResult.lineItems.length,
      },
    });

    return Response.json({ purchaseOrderId }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidPurchaseOrderInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not create purchase order',
      },
      { status: 400 },
    );
  }
}
