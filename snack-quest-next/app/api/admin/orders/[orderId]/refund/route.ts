import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  refundService,
  OrderNotFoundError,
  RefundNotPossibleError,
  RefundAlreadyInProgressError,
} from '@/services/refundService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * Initiates a real M-Pesa reversal for an order already flagged
 * `refund_requested` (§ RefundService + Daraja reversal support). The
 * response's `status` reflects what actually happened: `'processing'`
 * if Safaricom accepted the reversal request, `'failed'` if the
 * request itself was rejected — same honest-status discipline as
 * `POST /api/admin/withdrawals/[withdrawalId]/approve`.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { orderId } = await params;

  try {
    const status = await refundService.requestRefund(session.businessId, orderId, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'order.refund_initiate',
      entityType: 'order',
      entityId: orderId,
      after: { status },
    });
    return Response.json({ status });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof RefundAlreadyInProgressError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof RefundNotPossibleError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not initiate refund' },
      { status: 400 },
    );
  }
}
