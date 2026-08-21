import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { smsOptOutRepository } from '@/repositories/smsOptOutRepository';
import { normalizeKenyanPhone, InvalidPhoneNumberError } from '@/lib/checkout/phone';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * Takes a number back off the opt-out register (§ Admin: SMS opt-outs).
 *
 * Super admin only, deliberately stricter than adding one. Recording an
 * opt-out honours a request; undoing one overrides it, and puts someone
 * who asked to be left alone back into every future campaign. It should
 * only ever happen when the customer themselves asked to resubscribe,
 * or when the entry was a typo — both rare, both worth a second pair of
 * eyes.
 *
 * The register itself keeps no "was removed" state (see
 * `types/smsOptOut.ts`), so the audit entry written here is the whole
 * record that this happened. It captures the row as it stood, because
 * once deleted there is nothing left to reconstruct it from.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ phone: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { phone } = await params;
  let phoneNumber: string;
  try {
    phoneNumber = normalizeKenyanPhone(decodeURIComponent(phone));
  } catch (error) {
    if (error instanceof InvalidPhoneNumberError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const existing = await smsOptOutRepository.findOne(session.businessId, phoneNumber);
  if (!existing) {
    return Response.json({ error: 'That number is not on the opt-out register.' }, { status: 404 });
  }

  await smsOptOutRepository.removeOptOut(session.businessId, phoneNumber);

  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.uid,
    action: 'sms_opt_out.remove',
    entityType: 'smsOptOut',
    entityId: phoneNumber,
    before: { phoneNumber, source: existing.source, recordedBy: existing.recordedBy, note: existing.note },
    after: null,
  });

  return Response.json({ ok: true });
}
