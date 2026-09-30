import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { recipeService, RecipeValidationError } from '@/services/recipeService';
import { serializeSnackItem } from '@/lib/recipes/serialize';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { parseSnackItemBody } from '@/lib/recipes/parseSnackItemBody';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { priceBookService } from '@/services/priceBookService';

/** The snack catalogue (§ Box Recipes). Admin rather than super-admin: keeping it current is routine operational work, and gating it higher is how prices go stale. */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'products.view')) {
    return forbiddenForPermission('products.view');
  }

  const activeOnly = new URL(request.url).searchParams.get('activeOnly') === 'true';
  const items = await recipeService.listSnackItems(session.businessId, { activeOnly });
  // Snack Quest's cost is only sent to people allowed to see it.
  const showCost = hasPermission(session, 'products.cost.view');
  return Response.json({ items: items.map(({ id, data }) => serializeSnackItem(id, data, { showCost })) });
}

export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'products.snacks.manage')) {
    return forbiddenForPermission('products.snacks.manage');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const parsed = parseSnackItemBody(body);
  if ('error' in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  if (parsed.draft.expectedUnitCostKes !== undefined && !hasPermission(session, 'products.cost.manage')) {
    return forbiddenForPermission('products.cost.manage');
  }

  try {
    const itemId = await recipeService.createSnackItem(session.businessId, parsed.draft, session.uid);
    if (parsed.draft.expectedUnitCostKes !== undefined) {
      // The first cost opens the snack's price history.
      await priceBookService.setPrice({ businessId: session.businessId, productCatalogue: 'snackItem', productId: itemId, priceType: 'landed_cost', amountKes: Math.round(parsed.draft.expectedUnitCostKes), reason: 'Cost when the snack was added', actor: session.uid });
    }
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'snack_item.create',
      entityType: 'snackItem',
      entityId: itemId,
      before: null,
      after: { name: parsed.draft.name, expectedUnitCostKes: parsed.draft.expectedUnitCostKes ?? null },
    });
    return Response.json({ itemId }, { status: 201 });
  } catch (error) {
    if (error instanceof RecipeValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
