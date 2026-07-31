import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { productService } from '@/services/productService';

interface CreateProductBody {
  name?: unknown;
  description?: unknown;
  priceKes?: unknown;
  isActive?: unknown;
  stockCount?: unknown;
  imageUrl?: unknown;
}

function validate(body: CreateProductBody): { error: string } | null {
  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    return { error: '"name" is required.' };
  }
  if (typeof body.description !== 'string' || body.description.trim().length === 0) {
    return { error: '"description" is required.' };
  }
  if (typeof body.priceKes !== 'number' || !Number.isFinite(body.priceKes) || body.priceKes <= 0) {
    return { error: '"priceKes" must be a positive number.' };
  }
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    return { error: '"isActive" must be a boolean when provided.' };
  }
  if (
    body.stockCount !== undefined &&
    body.stockCount !== null &&
    (typeof body.stockCount !== 'number' || !Number.isFinite(body.stockCount) || body.stockCount < 0)
  ) {
    return { error: '"stockCount" must be a non-negative number, null, or omitted.' };
  }
  if (body.imageUrl !== undefined && body.imageUrl !== null && typeof body.imageUrl !== 'string') {
    return { error: '"imageUrl" must be a string or null when provided.' };
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

  const packageId = await productService.createProduct(
    {
      businessId: session.businessId,
      name: (body.name as string).trim(),
      description: (body.description as string).trim(),
      priceKes: body.priceKes as number,
      isActive: (body.isActive as boolean | undefined) ?? true,
      imageUrl: (body.imageUrl as string | null | undefined) ?? null,
      // Omitted entirely (not `undefined`) when unlimited — Firestore rejects an explicit `undefined` field value.
      ...(typeof body.stockCount === 'number' ? { stockCount: body.stockCount } : {}),
    },
    session.uid,
  );

  return Response.json({ packageId }, { status: 201 });
}
