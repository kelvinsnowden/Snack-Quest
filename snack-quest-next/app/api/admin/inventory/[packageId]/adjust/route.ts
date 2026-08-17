import {
  hasStaffRole,
  ADMIN_ONLY,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { inventoryService } from '@/services/inventoryService';
import {
  PackageNotFoundError,
  StockNotTrackedError,
  InsufficientStockError,
} from '@/repositories/packageRepository';
import type { InventoryMovementReason } from '@/types';

const VALID_REASONS: InventoryMovementReason[] = [
  'restock',
  'correction',
  'damaged',
  'other',
];

/**
 * The one write path for a manual stock adjustment (§ Admin:
 * Inventory) — always through `InventoryService.adjustStock()`, never
 * a direct `packages.stockCount` write, so every change is audited in
 * `inventoryMovements`.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ packageId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const { packageId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { delta, reason, note } = (body ?? {}) as {
    delta?: unknown;
    reason?: unknown;
    note?: unknown;
  };

  if (typeof delta !== 'number' || !Number.isInteger(delta) || delta === 0) {
    return Response.json(
      { error: '"delta" must be a non-zero integer.' },
      { status: 400 },
    );
  }
  if (
    typeof reason !== 'string' ||
    !VALID_REASONS.includes(reason as InventoryMovementReason)
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
    const resultingStockCount = await inventoryService.adjustStock(
      session.businessId,
      packageId,
      delta,
      reason as InventoryMovementReason,
      session.uid,
      note,
    );
    return Response.json({ resultingStockCount });
  } catch (error) {
    if (error instanceof PackageNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (
      error instanceof StockNotTrackedError ||
      error instanceof InsufficientStockError
    ) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not adjust stock',
      },
      { status: 400 },
    );
  }
}
