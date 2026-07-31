import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { productService } from '@/services/productService';
import { packageRepository, type PackageInput } from '@/repositories/packageRepository';

interface UpdateProductBody {
  name?: unknown;
  description?: unknown;
  priceKes?: unknown;
  isActive?: unknown;
  stockCount?: unknown;
  lowStockThreshold?: unknown;
  imageUrl?: unknown;
}

function buildPatch(body: UpdateProductBody): { patch: Partial<PackageInput> } | { error: string } {
  const patch: Partial<PackageInput> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return { error: '"name" must be a non-empty string when provided.' };
    }
    patch.name = body.name.trim();
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string' || body.description.trim().length === 0) {
      return { error: '"description" must be a non-empty string when provided.' };
    }
    patch.description = body.description.trim();
  }
  if (body.priceKes !== undefined) {
    if (typeof body.priceKes !== 'number' || !Number.isFinite(body.priceKes) || body.priceKes <= 0) {
      return { error: '"priceKes" must be a positive number when provided.' };
    }
    patch.priceKes = body.priceKes;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      return { error: '"isActive" must be a boolean when provided.' };
    }
    patch.isActive = body.isActive;
  }
  if (body.stockCount !== undefined) {
    if (typeof body.stockCount !== 'number' || !Number.isFinite(body.stockCount) || body.stockCount < 0) {
      return { error: '"stockCount" must be a non-negative number when provided.' };
    }
    patch.stockCount = body.stockCount;
  }
  if (body.lowStockThreshold !== undefined) {
    if (
      typeof body.lowStockThreshold !== 'number' ||
      !Number.isFinite(body.lowStockThreshold) ||
      body.lowStockThreshold < 0
    ) {
      return { error: '"lowStockThreshold" must be a non-negative number when provided.' };
    }
    patch.lowStockThreshold = body.lowStockThreshold;
  }
  if (body.imageUrl !== undefined) {
    if (body.imageUrl !== null && typeof body.imageUrl !== 'string') {
      return { error: '"imageUrl" must be a string or null when provided.' };
    }
    patch.imageUrl = body.imageUrl;
  }

  return { patch };
}

/**
 * Updates a package/box (§ Admin: Products) — full edit, or a
 * one-field `{ isActive: false }` patch for the list page's
 * deactivate action. Always through `productService.updateProduct()`
 * so the catalog re-sync never gets skipped.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ packageId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { packageId } = await params;

  const existing = await packageRepository.findById(session.businessId, packageId);
  if (!existing) {
    return Response.json({ error: `Product ${packageId} not found` }, { status: 404 });
  }

  let body: UpdateProductBody;
  try {
    body = (await request.json()) as UpdateProductBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const result = buildPatch(body);
  if ('error' in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  try {
    await productService.updateProduct(session.businessId, packageId, result.patch, session.uid);
    const updated = await packageRepository.findById(session.businessId, packageId);
    return Response.json({ product: updated });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not update product' },
      { status: 400 },
    );
  }
}
