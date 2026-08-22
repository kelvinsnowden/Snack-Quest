import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { paymentService } from '@/services/paymentService';
import { conversationService } from '@/services/conversationService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * Finishes a payment Daraja itself already confirmed succeeded — via
 * the "Check now" STK Push Query — but whose callback never arrived at
 * all (§ payment reconciliation: complete manually). That check's own
 * `needsManualReview` outcome says "confirm against the M-Pesa
 * statement and resolve manually"; this is the resolving.
 *
 * Super-admin only, same reasoning as recording a manual payment on a
 * brand-new order: this is the one way to turn an intent into a paid
 * order on a human's word (an M-Pesa receipt read off a statement or
 * SMS) rather than a provider callback proving the money moved.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ intentId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { intentId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { mpesaReceiptNumber, note } = (body ?? {}) as {
    mpesaReceiptNumber?: unknown;
    note?: unknown;
  };
  if (typeof mpesaReceiptNumber !== 'string' || !mpesaReceiptNumber.trim()) {
    return Response.json({ error: 'mpesaReceiptNumber is required' }, { status: 400 });
  }

  const outcome = await paymentService.completeManually({
    businessId: session.businessId,
    intentId,
    mpesaReceiptNumber,
    recordedByUid: session.uid,
    recordedByName: session.displayName || session.email,
    note: typeof note === 'string' && note.trim() ? note.trim() : null,
  });

  if (!outcome.settled || !outcome.result) {
    return Response.json({ error: outcome.reason ?? 'Could not complete this payment.' }, { status: 409 });
  }

  await conversationService.handlePaymentResult(outcome.result);

  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.uid,
    action: 'payment.complete_manually',
    entityType: 'paymentIntent',
    entityId: intentId,
    after: {
      mpesaReceiptNumber: outcome.result.mpesaReceiptNumber,
      amountKes: outcome.result.amountKes,
    },
  });

  return Response.json({ completed: true });
}
