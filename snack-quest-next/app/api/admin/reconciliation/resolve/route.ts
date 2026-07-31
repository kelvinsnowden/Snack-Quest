import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { webhookEventRepository } from '@/repositories/webhookEventRepository';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * A staff member's acknowledgment of an unmatched payment (§ Payment
 * reconciliation) — hardcoded to `provider: 'daraja'` deliberately,
 * not a generic "resolve any webhook event" endpoint: this route only
 * makes sense for the one real use case it was built for
 * (`listUnmatchedPayments`'s `stk_callback` events), never intended as
 * a general-purpose capability over the whole `webhookEvents` ledger.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { providerEventId, note } = (body ?? {}) as { providerEventId?: unknown; note?: unknown };
  if (typeof providerEventId !== 'string' || providerEventId.trim().length === 0) {
    return Response.json({ error: '"providerEventId" is required.' }, { status: 400 });
  }
  if (typeof note !== 'string' || note.trim().length === 0) {
    return Response.json({ error: '"note" is required — record what you found.' }, { status: 400 });
  }

  await webhookEventRepository.markResolved(session.businessId, 'daraja', providerEventId, session.uid, note.trim());
  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.uid,
    action: 'reconciliation.resolve',
    entityType: 'webhookEvent',
    entityId: providerEventId,
    after: { note: note.trim() },
  });

  return Response.json({ ok: true });
}
