import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { discountCodeRepository } from '@/repositories/discountCodeRepository';
import { normalizeDiscountCode, validateDiscountCodeInput } from '@/lib/checkout/discountCode';

/**
 * Discount codes for staff to create and manage (§ discount codes).
 *
 * Super-admin only, deliberately. A 100% code is the ability to give
 * away stock, and it should sit behind the same door as the other
 * things that move money.
 */

export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const codes = await discountCodeRepository.listByBusiness(getCurrentBusinessId());
  return Response.json({
    codes: codes.map((code) => ({
      ...code,
      // Serialized for the client component, which cannot receive a
      // Firestore Timestamp across the boundary.
      startsAt: code.startsAt?.toMillis?.() ?? null,
      expiresAt: code.expiresAt?.toMillis?.() ?? null,
      createdAt: code.createdAt?.toMillis?.() ?? null,
      updatedAt: code.updatedAt?.toMillis?.() ?? null,
    })),
  });
}

export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const code = typeof body.code === 'string' ? body.code : '';
  const kind = body.kind === 'fixed' ? 'fixed' : 'percentage';
  const value = Number(body.value);
  const maxRedemptions =
    body.maxRedemptions === null || body.maxRedemptions === undefined || body.maxRedemptions === ''
      ? null
      : Number(body.maxRedemptions);

  // The same validation the form runs, so saving by going around the
  // UI cannot create a code the UI would have refused.
  const problem = validateDiscountCodeInput({ code, kind, value, maxRedemptions });
  if (problem) {
    return Response.json({ error: problem }, { status: 400 });
  }

  const expiresAt = typeof body.expiresAt === 'string' && body.expiresAt ? new Date(body.expiresAt) : null;
  const startsAt = typeof body.startsAt === 'string' && body.startsAt ? new Date(body.startsAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return Response.json({ error: 'Expiry date is not a valid date.' }, { status: 400 });
  }
  if (startsAt && Number.isNaN(startsAt.getTime())) {
    return Response.json({ error: 'Start date is not a valid date.' }, { status: 400 });
  }
  /*
   * A code that expires before it starts can never be used, and is far
   * more likely a typo than an intention.
   */
  if (startsAt && expiresAt && expiresAt <= startsAt) {
    return Response.json({ error: 'Expiry must be after the start date.' }, { status: 400 });
  }

  const result = await discountCodeRepository.create({
    businessId: getCurrentBusinessId(),
    code: normalizeDiscountCode(code),
    kind,
    value,
    waivesDelivery: body.waivesDelivery === true,
    maxRedemptions,
    startsAt,
    expiresAt,
    isActive: body.isActive !== false,
    note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
    createdBy: session.uid,
  });

  if (!result.created) {
    // 409, not 400: the request was well formed, the name is taken.
    return Response.json({ error: result.reason }, { status: 409 });
  }

  return Response.json({ code: normalizeDiscountCode(code) }, { status: 201 });
}

export async function PATCH(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const code = typeof body.code === 'string' ? body.code : '';
  if (!code) {
    return Response.json({ error: 'code is required' }, { status: 400 });
  }

  const existing = await discountCodeRepository.findByCode(getCurrentBusinessId(), code);
  if (!existing) {
    return Response.json({ error: 'Discount code not found' }, { status: 404 });
  }

  // Only the switch and the note are editable here. Changing a live
  // code's value or limit after it has been handed out changes a
  // promise somebody is already holding; deactivating it and issuing a
  // new one says what actually happened.
  await discountCodeRepository.update(
    getCurrentBusinessId(),
    code,
    {
      ...(body.isActive !== undefined ? { isActive: body.isActive === true } : {}),
      ...(typeof body.note === 'string' ? { note: body.note.trim() || null } : {}),
    },
    session.uid,
  );

  return Response.json({ ok: true });
}
