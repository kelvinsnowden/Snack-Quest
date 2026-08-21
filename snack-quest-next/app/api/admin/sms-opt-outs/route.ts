import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_ONLY, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { smsOptOutRepository } from '@/repositories/smsOptOutRepository';
import { serializeSmsOptOut } from '@/lib/marketingSms/serialize';
import { normalizeKenyanPhone, InvalidPhoneNumberError } from '@/lib/checkout/phone';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * The opt-out register, for staff (§ Admin: SMS opt-outs).
 *
 * Admin rather than super-admin, unlike campaign sending. Adding
 * someone to this register is the safe direction — a customer rings up
 * or messages asking to stop, and whoever takes that call has to be
 * able to honour it immediately. Making them find a super admin first
 * is how a request gets forgotten and the next campaign texts someone
 * who already asked twice. Removing a number is the direction that
 * needs care, and lives on the DELETE route.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const [optOuts, total] = await Promise.all([
    smsOptOutRepository.listByBusiness(session.businessId),
    smsOptOutRepository.countByBusiness(session.businessId),
  ]);

  return Response.json({ optOuts: optOuts.map(serializeSmsOptOut), total });
}

/** Records an opt-out on a customer's behalf — for a request that arrived by phone, WhatsApp or in person. */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { phone, note } = (body ?? {}) as { phone?: unknown; note?: unknown };
  if (typeof phone !== 'string' || !phone.trim()) {
    return Response.json({ error: 'phone is required' }, { status: 400 });
  }

  let phoneNumber: string;
  try {
    phoneNumber = normalizeKenyanPhone(phone);
  } catch (error) {
    if (error instanceof InvalidPhoneNumberError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  await smsOptOutRepository.recordOptOut({
    businessId: session.businessId,
    phoneNumber,
    source: 'admin',
    recordedBy: session.uid,
    note: typeof note === 'string' && note.trim() ? note.trim() : null,
  });

  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.uid,
    action: 'sms_opt_out.record',
    entityType: 'smsOptOut',
    entityId: phoneNumber,
    before: null,
    after: { phoneNumber, source: 'admin' },
  });

  return Response.json({ ok: true, phoneNumber }, { status: 201 });
}
