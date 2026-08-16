import {
  hasStaffRole,
  ADMIN_ONLY,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  inventoryService,
  InventoryBatchNotFoundError,
  InsufficientBatchQuantityError,
  InvalidWriteOffQuantityError,
} from '@/services/inventoryService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

const VALID_REASONS = ['expired', 'written_off'] as const;
type WriteOffReason = (typeof VALID_REASONS)[number];

/** Writes off some or all of a batch's remaining quantity (§ Inventory: batches, purchase orders, suppliers, movements, low-stock alerts, expiry, audit trail). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const { batchId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { quantity, reason, note } = (body ?? {}) as {
    quantity?: unknown;
    reason?: unknown;
    note?: unknown;
  };

  if (
    typeof quantity !== 'number' ||
    !Number.isInteger(quantity) ||
    quantity <= 0
  ) {
    return Response.json(
      { error: '"quantity" must be a positive whole number.' },
      { status: 400 },
    );
  }
  if (
    typeof reason !== 'string' ||
    !VALID_REASONS.includes(reason as WriteOffReason)
  ) {
    return Response.json(
      { error: `"reason" must be one of: ${VALID_REASONS.join(', ')}.` },
      { status: 400 },
    );
  }
  if (note !== undefined && typeof note !== 'string') {
    return Response.json(
      { error: '"note" must be a string when provided.' },
      { status: 400 },
    );
  }

  try {
    const result = await inventoryService.writeOffBatch(
      session.businessId,
      batchId,
      quantity,
      reason as WriteOffReason,
      session.uid,
      note as string | undefined,
    );

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'inventory_batch.write_off',
      entityType: 'inventoryBatch',
      entityId: batchId,
      after: { quantity, reason, remaining: result.remaining },
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof InventoryBatchNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (
      error instanceof InsufficientBatchQuantityError ||
      error instanceof InvalidWriteOffQuantityError
    ) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not write off this batch',
      },
      { status: 400 },
    );
  }
}
