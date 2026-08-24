import { FieldValue } from 'firebase-admin/firestore';
import {
  hasStaffRole,
  ADMIN_ONLY,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { productService } from '@/services/productService';
import {
  packageRepository,
  type PackageUpdate,
} from '@/repositories/packageRepository';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import type { Package } from '@/types';

interface UpdateProductBody {
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


function buildPatch(
  body: UpdateProductBody,
): { patch: PackageUpdate } | { error: string } {
  const patch: PackageUpdate = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return { error: '"name" must be a non-empty string when provided.' };
    }
    patch.name = body.name.trim();
  }
  if (body.description !== undefined) {
    if (
      typeof body.description !== 'string' ||
      body.description.trim().length === 0
    ) {
      return {
        error: '"description" must be a non-empty string when provided.',
      };
    }
    patch.description = body.description.trim();
  }
  if (body.priceKes !== undefined) {
    if (
      typeof body.priceKes !== 'number' ||
      !Number.isFinite(body.priceKes) ||
      body.priceKes <= 0
    ) {
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
    if (
      typeof body.stockCount !== 'number' ||
      !Number.isFinite(body.stockCount) ||
      body.stockCount < 0
    ) {
      return {
        error: '"stockCount" must be a non-negative number when provided.',
      };
    }
    patch.stockCount = body.stockCount;
  }
  if (body.lowStockThreshold !== undefined) {
    if (
      typeof body.lowStockThreshold !== 'number' ||
      !Number.isFinite(body.lowStockThreshold) ||
      body.lowStockThreshold < 0
    ) {
      return {
        error:
          '"lowStockThreshold" must be a non-negative number when provided.',
      };
    }
    patch.lowStockThreshold = body.lowStockThreshold;
  }
  if (body.imageUrl !== undefined) {
    if (body.imageUrl !== null && typeof body.imageUrl !== 'string') {
      return { error: '"imageUrl" must be a string or null when provided.' };
    }
    patch.imageUrl = body.imageUrl;
  }
  if (body.snackCountLabel !== undefined) {
    if (
      typeof body.snackCountLabel !== 'string' ||
      body.snackCountLabel.trim().length === 0
    ) {
      return {
        error: '"snackCountLabel" must be a non-empty string when provided.',
      };
    }
    patch.snackCountLabel = body.snackCountLabel.trim();
  }
  if (body.guaranteedPickCount !== undefined) {
    if (
      typeof body.guaranteedPickCount !== 'number' ||
      !Number.isFinite(body.guaranteedPickCount) ||
      body.guaranteedPickCount < 0
    ) {
      return { error: '"guaranteedPickCount" must be a number of 0 or more when provided.' };
    }
    // Deleted rather than stored as 0: an absent field is what "this
    // box is fully curated" looks like everywhere else that reads it,
    // and leaving a 0 behind would be a second way to say the same
    // thing.
    patch.guaranteedPickCount =
      body.guaranteedPickCount > 0 ? Math.trunc(body.guaranteedPickCount) : FieldValue.delete();
  }
  if (body.highlightLabel !== undefined) {
    if (body.highlightLabel !== null && typeof body.highlightLabel !== 'string') {
      return { error: '"highlightLabel" must be a string or null when provided.' };
    }
    const label = typeof body.highlightLabel === 'string' ? body.highlightLabel.trim() : '';
    patch.highlightLabel = label.length > 0 ? label : FieldValue.delete();
  }
  if (body.isRescueOffer !== undefined) {
    if (typeof body.isRescueOffer !== 'boolean') {
      return { error: '"isRescueOffer" must be a boolean when provided.' };
    }
    patch.isRescueOffer = body.isRescueOffer;
  }
  if (body.offerExpiresAt !== undefined) {
    if (
      body.offerExpiresAt !== null &&
      typeof body.offerExpiresAt !== 'string'
    ) {
      return {
        error: '"offerExpiresAt" must be a date string, null, or omitted.',
      };
    }
    if (
      typeof body.offerExpiresAt === 'string' &&
      Number.isNaN(new Date(body.offerExpiresAt).getTime())
    ) {
      return {
        error: '"offerExpiresAt" must be a valid date string when provided.',
      };
    }
    patch.offerExpiresAt =
      typeof body.offerExpiresAt === 'string'
        ? (new Date(
            body.offerExpiresAt,
          ) as unknown as Package['offerExpiresAt'])
        : null;
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
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const { packageId } = await params;

  const existing = await packageRepository.findById(
    session.businessId,
    packageId,
  );
  if (!existing) {
    return Response.json(
      { error: `Product ${packageId} not found` },
      { status: 404 },
    );
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
    await productService.updateProduct(
      session.businessId,
      packageId,
      result.patch,
      session.uid,
    );
    const updated = await packageRepository.findById(
      session.businessId,
      packageId,
    );
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'product.update',
      entityType: 'package',
      entityId: packageId,
      before: existing as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
    });
    return Response.json({ product: updated });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not update product',
      },
      { status: 400 },
    );
  }
}
