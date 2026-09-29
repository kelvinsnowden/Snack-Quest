import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, hasAnyPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { vendingSaleReviewService, SaleReviewError, SALE_REVIEW_ACTIONS, type SaleReviewAction } from '@/services/vendingSaleReviewService';

const STATUS_FOR: Record<SaleReviewError['code'], number> = { not_found: 404, invalid: 400, conflict: 409 };

/**
 * A person's decision on a vending sale the system would not decide on
 * its own: `{ action, note, reference? }`. Confirming or refunding needs
 * `sales.review.resolve`; sending the money needs `sales.refund`. Every decision is audited
 * with the note the person wrote.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasAnyPermission(session, ['sales.review.resolve', 'sales.refund'])) {
    return forbiddenForPermission('sales.review.resolve');
  }
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { action, note, reference } = body;
  if (typeof action !== 'string' || !SALE_REVIEW_ACTIONS.includes(action as SaleReviewAction)) {
    return Response.json({ error: `action must be one of: ${SALE_REVIEW_ACTIONS.join(', ')}` }, { status: 400 });
  }
  if (typeof note !== 'string') {
    return Response.json({ error: 'note is required' }, { status: 400 });
  }
  if (reference !== undefined && reference !== null && typeof reference !== 'string') {
    return Response.json({ error: 'reference must be a string' }, { status: 400 });
  }
  // Deciding what happened is one permission; sending money back is another.
  const needed = action === 'reverse_payment' || action === 'record_refund' ? 'sales.refund' : 'sales.review.resolve';
  if (!hasPermission(session, needed)) {
    return forbiddenForPermission(needed);
  }

  try {
    const before = await vendingSaleReviewService.getSale(session.businessId, id);
    const result = await vendingSaleReviewService.resolve(session.businessId, id, { action: action as SaleReviewAction, note, reference: (reference as string | null | undefined) ?? null }, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: `sale_review_${action}`,
      entityType: 'machineTransaction',
      entityId: id,
      before: { status: before.sale.status, amountKes: before.sale.amountKes },
      after: { status: result.status, note: note.trim(), ...(result.refundStatus ? { refundStatus: result.refundStatus } : {}), ...(typeof reference === 'string' && reference.trim() ? { reference: reference.trim().toUpperCase() } : {}) },
      machineId: before.sale.machineId,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof SaleReviewError) {
      return Response.json({ error: error.message }, { status: STATUS_FOR[error.code] });
    }
    throw error;
  }
}
