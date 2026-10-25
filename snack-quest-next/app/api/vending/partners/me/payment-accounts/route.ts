import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { connectInputFrom, connectRateLimited } from '@/lib/vending/ownerTillRequest';
import { ownerPaymentAccountService, PaymentAccountValidationError } from '@/services/ownerPaymentAccountService';

/**
 * The owner's own M-Pesa tills (§ OWNER TILL), always their own
 * (`session.partnerId`). GET lists them without their keys; POST adds one
 * and checks it with Safaricom, charging nobody.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  return Response.json({ tills: await ownerPaymentAccountService.list(session.businessId, session.partnerId) });
}

export async function POST(request: Request): Promise<Response> {
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
  if (await connectRateLimited(session.partnerId)) {
    return Response.json({ error: 'That’s a lot of checks in an hour. Wait a little, then try again.' }, { status: 429 });
  }
  try {
    const { view, problem } = await ownerPaymentAccountService.connect(session.businessId, session.partnerId, null, connectInputFrom(body));
    // Never the keys: only what was connected and whether it worked.
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.partnerId,
      action: 'owner_add_mpesa_till',
      entityType: 'partnerPaymentAccount',
      entityId: view.id,
      after: { accountType: view.accountType, shortcode: view.shortcode, headOfficeShortcode: view.headOfficeShortcode, status: view.status, lastError: view.lastError, machineIds: view.machineIds },
      source: 'owner_portal',
    });
    return Response.json({ till: view, problem }, { status: 201 });
  } catch (error) {
    if (error instanceof PaymentAccountValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
