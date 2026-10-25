import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { defaultRateLimiter } from '@/lib/rateLimit/rateLimiter';
import { ownerPaymentAccountService, PaymentAccountValidationError } from '@/services/ownerPaymentAccountService';

/** Each check asks Safaricom; a few an hour is plenty for an owner fixing a typo. */
const CHECK_LIMIT = { name: 'owner-till-check', limit: 10, windowSeconds: 60 * 60 };

/**
 * The owner's own M-Pesa till or paybill (§ OWNER TILL), always their
 * own (`session.partnerId`). GET shows it without its keys; PUT saves and
 * checks it with Safaricom, charging nobody; DELETE disconnects it and
 * removes the keys.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  return Response.json({ account: await ownerPaymentAccountService.view(session.businessId, session.partnerId) });
}

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
  const text = (value: unknown) => (typeof value === 'string' ? value : '');

  let allowed = true;
  try {
    allowed = (await defaultRateLimiter().check([{ key: `owner-till:${session.partnerId}`, rule: CHECK_LIMIT }])).allowed;
  } catch (error) {
    console.error('[owner till] rate limit check failed', error);
  }
  if (!allowed) {
    return Response.json({ error: 'That’s a lot of checks in an hour. Wait a little, then try again.' }, { status: 429 });
  }

  try {
    const { view, problem } = await ownerPaymentAccountService.connect(session.businessId, session.partnerId, {
      accountType: body.accountType === 'paybill' ? 'paybill' : 'till',
      shortcode: text(body.shortcode),
      headOfficeShortcode: text(body.headOfficeShortcode) || null,
      consumerKey: text(body.consumerKey),
      consumerSecret: text(body.consumerSecret),
      passkey: text(body.passkey),
    });
    // Never the keys: only what was connected and whether it worked.
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.partnerId,
      action: 'owner_connect_mpesa_account',
      entityType: 'partnerPaymentAccount',
      entityId: session.partnerId,
      after: { accountType: view.accountType, shortcode: view.shortcode, headOfficeShortcode: view.headOfficeShortcode, status: view.status, lastError: view.lastError },
      source: 'owner_portal',
    });
    return Response.json({ account: view, problem });
  } catch (error) {
    if (error instanceof PaymentAccountValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const removed = await ownerPaymentAccountService.disconnect(session.businessId, session.partnerId);
  if (removed) {
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.partnerId,
      action: 'owner_disconnect_mpesa_account',
      entityType: 'partnerPaymentAccount',
      entityId: session.partnerId,
      source: 'owner_portal',
    });
  }
  return Response.json({ ok: true });
}
