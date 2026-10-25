import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { ownerPaymentAccountService, PaymentAccountValidationError } from '@/services/ownerPaymentAccountService';

/**
 * Which of the owner's tills one of their machines is paid into
 * (§ OWNER TILL): `{ machineId, accountId }`, with `accountId` null for
 * Snack Quest's account. Both must be the owner's own.
 */
export async function PUT(request: Request): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const machineId = typeof body.machineId === 'string' ? body.machineId : '';
  const accountId = typeof body.accountId === 'string' && body.accountId ? body.accountId : null;
  if (!machineId) {
    return Response.json({ error: 'machineId is required' }, { status: 400 });
  }
  try {
    await ownerPaymentAccountService.assignMachine(session.businessId, session.partnerId, machineId, accountId);
  } catch (error) {
    if (error instanceof PaymentAccountValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.partnerId,
    action: 'owner_choose_machine_till',
    entityType: 'machine',
    entityId: machineId,
    after: { accountId },
    machineId,
    source: 'owner_portal',
  });
  const { route } = await ownerPaymentAccountService.routeFor(session.businessId, machineId, session.partnerId);
  return Response.json({ ok: true, route });
}
