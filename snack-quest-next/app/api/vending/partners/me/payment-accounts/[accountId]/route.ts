import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { connectInputFrom, connectRateLimited } from '@/lib/vending/ownerTillRequest';
import { ownerPaymentAccountService, PaymentAccountValidationError } from '@/services/ownerPaymentAccountService';

/**
 * One of the owner's own tills (§ OWNER TILL). PUT saves new details and
 * checks them again; DELETE disconnects it, deleting its keys, and its
 * machines go back to Snack Quest's account.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ accountId: string }> }): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { accountId } = await params;
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (await connectRateLimited(session.partnerId)) {
    return Response.json({ error: 'That’s a lot of checks in an hour. Wait a little, then try again.' }, { status: 429 });
  }
  try {
    const { view, problem } = await ownerPaymentAccountService.connect(session.businessId, session.partnerId, accountId, connectInputFrom(body));
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.partnerId,
      action: 'owner_update_mpesa_till',
      entityType: 'partnerPaymentAccount',
      entityId: accountId,
      after: { accountType: view.accountType, shortcode: view.shortcode, headOfficeShortcode: view.headOfficeShortcode, status: view.status, lastError: view.lastError },
      source: 'owner_portal',
    });
    return Response.json({ till: view, problem });
  } catch (error) {
    if (error instanceof PaymentAccountValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ accountId: string }> }): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { accountId } = await params;
  if (!(await ownerPaymentAccountService.disconnect(session.businessId, session.partnerId, accountId))) {
    return Response.json({ error: 'not found' }, { status: 404 });
  }
  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.partnerId,
    action: 'owner_disconnect_mpesa_till',
    entityType: 'partnerPaymentAccount',
    entityId: accountId,
    source: 'owner_portal',
  });
  return Response.json({ ok: true });
}
