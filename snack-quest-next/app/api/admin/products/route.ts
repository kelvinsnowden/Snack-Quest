import {
  hasStaffRole,
  ADMIN_ONLY,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { productService } from '@/services/productService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import type { Package } from '@/types';

interface CreateProductBody {
  name?: unknown;
  description?: unknown;
  priceKes?: unknown;
  isActive?: unknown;
  stockCount?: unknown;
  lowStockThreshold?: unknown;
  imageUrl?: unknown;
  snackCountLabel?: unknown;
  guaranteedPickCount?: unknown;
  highlightLabel?: unknown;
  isRescueOffer?: unknown;
  offerExpiresAt?: unknown;
}

function validate(body: CreateProductBody): { error: string } | null {
  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    return { error: '"name" is required.' };
  }
  if (
    typeof body.description !== 'string' ||
    body.description.trim().length === 0
  ) {
    return { error: '"description" is required.' };
  }
  if (
    typeof body.priceKes !== 'number' ||
    !Number.isFinite(body.priceKes) ||
    body.priceKes <= 0
  ) {
    return { error: '"priceKes" must be a positive number.' };
  }
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    return { error: '"isActive" must be a boolean when provided.' };
  }
  if (
    body.stockCount !== undefined &&
    body.stockCount !== null &&
    (typeof body.stockCount !== 'number' ||
      !Number.isFinite(body.stockCount) ||
      body.stockCount < 0)
  ) {
    return {
      error: '"stockCount" must be a non-negative number, null, or omitted.',
    };
  }
  if (
    body.lowStockThreshold !== undefined &&
    body.lowStockThreshold !== null &&
    (typeof body.lowStockThreshold !== 'number' ||
      !Number.isFinite(body.lowStockThreshold) ||
      body.lowStockThreshold < 0)
  ) {
    return {
      error:
        '"lowStockThreshold" must be a non-negative number, null, or omitted.',
    };
  }
  if (
    body.imageUrl !== undefined &&
    body.imageUrl !== null &&
    typeof body.imageUrl !== 'string'
  ) {
    return { error: '"imageUrl" must be a string or null when provided.' };
  }
  if (
    body.snackCountLabel !== undefined &&
    typeof body.snackCountLabel !== 'string'
  ) {
    return { error: '"snackCountLabel" must be a string when provided.' };
  }
  if (
    body.guaranteedPickCount !== undefined &&
    (typeof body.guaranteedPickCount !== 'number' ||
      !Number.isFinite(body.guaranteedPickCount) ||
      body.guaranteedPickCount < 0)
  ) {
    return { error: '"guaranteedPickCount" must be a number of 0 or more when provided.' };
  }
  if (
    body.highlightLabel !== undefined &&
    body.highlightLabel !== null &&
    typeof body.highlightLabel !== 'string'
  ) {
    return { error: '"highlightLabel" must be a string or null when provided.' };
  }
  if (
    body.isRescueOffer !== undefined &&
    typeof body.isRescueOffer !== 'boolean'
  ) {
    return { error: '"isRescueOffer" must be a boolean when provided.' };
  }
  if (
    body.offerExpiresAt !== undefined &&
    body.offerExpiresAt !== null &&
    (typeof body.offerExpiresAt !== 'string' ||
      Number.isNaN(new Date(body.offerExpiresAt).getTime()))
  ) {
    return {
      error: '"offerExpiresAt" must be a valid date string, null, or omitted.',
    };
  }
  return null;
}

/**
 * Creates a package/box (§ Admin: Products). Goes through
 * `productService.createProduct()`, never `packageRepository`
 * directly, so the WhatsApp catalog sync this Service owns never gets
 * forgotten at a call site.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  let body: CreateProductBody;
  try {
    body = (await request.json()) as CreateProductBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const validationError = validate(body);
  if (validationError) {
    return Response.json(validationError, { status: 400 });
  }

  const productInput = {
    businessId: session.businessId,
    name: (body.name as string).trim(),
    description: (body.description as string).trim(),
    priceKes: body.priceKes as number,
    isActive: (body.isActive as boolean | undefined) ?? true,
    imageUrl: (body.imageUrl as string | null | undefined) ?? null,
    // Omitted entirely (not `undefined`) when unset — Firestore rejects an explicit `undefined` field value.
    ...(typeof body.stockCount === 'number'
      ? { stockCount: body.stockCount }
      : {}),
    ...(typeof body.lowStockThreshold === 'number'
      ? { lowStockThreshold: body.lowStockThreshold }
      : {}),
    ...(typeof body.snackCountLabel === 'string' &&
    body.snackCountLabel.trim().length > 0
      ? { snackCountLabel: body.snackCountLabel.trim() }
      : {}),
    // Absent rather than 0/null — Firestore rejects `undefined`, and a
    // box that never offers picks should carry no field at all.
    ...(typeof body.guaranteedPickCount === 'number' && body.guaranteedPickCount > 0
      ? { guaranteedPickCount: Math.trunc(body.guaranteedPickCount) }
      : {}),
    ...(typeof body.highlightLabel === 'string' && body.highlightLabel.trim().length > 0
      ? { highlightLabel: body.highlightLabel.trim() }
      : {}),
    isRescueOffer: (body.isRescueOffer as boolean | undefined) ?? false,
    offerExpiresAt:
      typeof body.offerExpiresAt === 'string'
        ? (new Date(
            body.offerExpiresAt,
          ) as unknown as Package['offerExpiresAt'])
        : null,
  };
  const packageId = await productService.createProduct(
    productInput,
    session.uid,
  );

  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.uid,
    action: 'product.create',
    entityType: 'package',
    entityId: packageId,
    after: productInput,
  });

  return Response.json({ packageId }, { status: 201 });
}
