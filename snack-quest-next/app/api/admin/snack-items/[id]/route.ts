import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { recipeService, RecipeValidationError, SnackItemNotFoundError } from '@/services/recipeService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { parseSnackItemBody } from '@/lib/recipes/parseSnackItemBody';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { priceBookService } from '@/services/priceBookService';

function errorResponse(error: unknown): Response | null {
  if (error instanceof SnackItemNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof RecipeValidationError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  return null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
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

  const { id } = await params;
  try {
    const before = await recipeService.getSnackItem(session.businessId, id);
    const newCost = parsed.draft.expectedUnitCostKes === undefined ? undefined : Math.round(parsed.draft.expectedUnitCostKes);
    const costChanges = newCost !== undefined && (before.costPending === true || newCost !== before.expectedUnitCostKes);
    if (costChanges && !hasPermission(session, 'products.cost.manage')) {
      return forbiddenForPermission('products.cost.manage');
    }
    await recipeService.updateSnackItem(session.businessId, id, parsed.draft, session.uid);
    if (costChanges) {
      // A cost change goes through the price book, so it is kept in the history and never rewrites past sales.
      const reason = typeof (body as Record<string, unknown>).costChangeReason === 'string' && ((body as Record<string, unknown>).costChangeReason as string).trim().length >= 3 ? ((body as Record<string, unknown>).costChangeReason as string) : 'Changed on the snack form';
      await priceBookService.setPrice({ businessId: session.businessId, productCatalogue: 'snackItem', productId: id, priceType: 'landed_cost', amountKes: newCost, reason, actor: session.uid });
    }
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'snack_item.update',
      entityType: 'snackItem',
      entityId: id,
      before: { name: before.name, expectedUnitCostKes: before.costPending ? null : before.expectedUnitCostKes },
      after: { name: parsed.draft.name, expectedUnitCostKes: costChanges ? newCost : before.costPending ? null : before.expectedUnitCostKes },
    });
    return Response.json({ ok: true });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'products.snacks.manage')) {
    return forbiddenForPermission('products.snacks.manage');
  }

  const { id } = await params;
  try {
    await recipeService.deleteSnackItem(session.businessId, id);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'snack_item.delete',
      entityType: 'snackItem',
      entityId: id,
      after: null,
    });
    return Response.json({ ok: true });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    throw error;
  }
}
