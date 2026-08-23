import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { paymentService } from '@/services/paymentService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import type { ManualPaymentMethod } from '@/types';

const MANUAL_PAYMENT_METHODS: ManualPaymentMethod[] = ['cash', 'mpesa_manual', 'bank_transfer'];

/**
 * `PATCH /api/admin/orders/{orderId}/manual-payment`
 * (§ correcting a manually recorded payment) — fixes the details of a
 * payment a human typed in, after the fact.
 *
 * Restricted to super admins, the same gate that recording one has,
 * and for the same reason: this is the one kind of payment in the
 * system whose evidence is a person's word rather than a provider
 * callback, so both asserting it and amending it are the same level of
 * privilege.
 *
 * It cannot change what the order cost, and it cannot change who
 * originally vouched for the payment — see `correctManualPayment`. The
 * audit entry carries the full before and after, which is what makes
 * an edit to financial data safe to allow at all.
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
  const { method, reference, note } = (body ?? {}) as {
    method?: unknown;
    reference?: unknown;
    note?: unknown;
  };
  if (typeof method !== 'string' || !MANUAL_PAYMENT_METHODS.includes(method as ManualPaymentMethod)) {
    return Response.json(
      { error: `method must be one of: ${MANUAL_PAYMENT_METHODS.join(', ')}` },
      { status: 400 },
    );
  }

  const outcome = await paymentService.correctManualPayment({
    businessId: session.businessId,
    orderId,
    method: method as ManualPaymentMethod,
    reference: typeof reference === 'string' ? reference : null,
    note: typeof note === 'string' ? note : null,
    // Always the authenticated session, never anything the body
    // claims — this is the accountability record for the correction.
    correctedByUid: session.uid,
    correctedByName: session.displayName || session.email,
  });

  if (!outcome.corrected) {
    return Response.json({ error: outcome.reason ?? 'Could not correct this payment.' }, { status: 400 });
  }

  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.uid,
    action: 'order.correct_manual_payment',
    entityType: 'order',
    entityId: orderId,
    before: {
      method: outcome.before?.method ?? null,
      reference: outcome.before?.reference ?? null,
      note: outcome.before?.note ?? null,
    },
    after: {
      method: outcome.after?.method ?? null,
      reference: outcome.after?.reference ?? null,
      note: outcome.after?.note ?? null,
    },
  });

  return Response.json({ corrected: true });
}
