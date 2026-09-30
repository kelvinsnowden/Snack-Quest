import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, hasAnyPermission, forbiddenForPermission, type PermissionKey } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { priceBookService, PriceBookValidationError, PriceBookProductNotFoundError } from '@/services/priceBookService';
import { PRODUCT_PRICE_TYPES, type ProductPriceType } from '@/types';

type Catalogue = 'package' | 'snackItem';
const isCatalogue = (value: string): value is Catalogue => value === 'package' || value === 'snackItem';

/** Seeing a price and changing it are separate permissions; Snack Quest's own cost is guarded apart from the prices owners and customers see. */
const VIEW: Record<ProductPriceType, PermissionKey> = { landed_cost: 'products.cost.view', owner_wholesale: 'products.wholesale.view', retail_list: 'products.wholesale.view' };
const MANAGE: Record<ProductPriceType, PermissionKey> = { landed_cost: 'products.cost.manage', owner_wholesale: 'products.wholesale.manage', retail_list: 'products.wholesale.manage' };

/**
 * A product's price book (§ PRICE HISTORY): the prices in effect now and
 * every earlier one, filtered to the price types this person may see —
 * someone without `products.cost.view` never receives Snack Quest's landed
 * cost, not even in the history.
 */
export async function GET(request: Request, { params }: { params: Promise<{ productCatalogue: string; productId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  // Anyone who works with products, or who may see a kind of price, may read the prices they are allowed to see.
  if (!hasAnyPermission(session, ['products.view', 'products.cost.view', 'products.wholesale.view'])) return forbiddenForPermission('products.view');
  const { productCatalogue, productId } = await params;
  if (!isCatalogue(productCatalogue)) return Response.json({ error: 'Unknown product catalogue.' }, { status: 404 });
  const visible = PRODUCT_PRICE_TYPES.filter((type) => hasPermission(session, VIEW[type]));
  const [current, history] = await Promise.all([priceBookService.currentPrices(session.businessId, productCatalogue, productId), priceBookService.history(session.businessId, productCatalogue, productId)]);
  return Response.json({
    visibleTypes: visible,
    current: {
      landed_cost: visible.includes('landed_cost') ? current.landedCostKes : undefined,
      owner_wholesale: visible.includes('owner_wholesale') ? current.ownerWholesaleKes : undefined,
      retail_list: visible.includes('retail_list') ? current.retailListKes : undefined,
    },
    history: history
      .filter(({ data }) => visible.includes(data.priceType))
      .map(({ id, data }) => ({
        id,
        priceType: data.priceType,
        amountKes: data.amountKes,
        effectiveFrom: data.effectiveFrom.toDate().toISOString(),
        effectiveTo: data.effectiveTo ? data.effectiveTo.toDate().toISOString() : null,
        reason: data.reason,
        createdBy: data.createdBy,
      })),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ productCatalogue: string; productId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { productCatalogue, productId } = await params;
  if (!isCatalogue(productCatalogue)) return Response.json({ error: 'Unknown product catalogue.' }, { status: 404 });
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const priceType = body.priceType;
  if (typeof priceType !== 'string' || !(PRODUCT_PRICE_TYPES as readonly string[]).includes(priceType)) {
    return Response.json({ error: `"priceType" must be one of: ${PRODUCT_PRICE_TYPES.join(', ')}.` }, { status: 400 });
  }
  const needed = MANAGE[priceType as ProductPriceType];
  if (!hasPermission(session, needed)) return forbiddenForPermission(needed);
  if (typeof body.amountKes !== 'number' || typeof body.reason !== 'string') {
    return Response.json({ error: '"amountKes" (a number) and "reason" are required.' }, { status: 400 });
  }
  try {
    const result = await priceBookService.setPrice({
      businessId: session.businessId,
      productCatalogue,
      productId,
      priceType: priceType as ProductPriceType,
      amountKes: body.amountKes,
      reason: body.reason,
      actor: session.uid,
    });
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'product_price.set',
      entityType: productCatalogue,
      entityId: productId,
      before: { priceType, amountKes: result.previousKes },
      after: { priceType, amountKes: body.amountKes, reason: body.reason.trim() },
    });
    return Response.json({ priceId: result.priceId }, { status: 201 });
  } catch (error) {
    if (error instanceof PriceBookValidationError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof PriceBookProductNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
