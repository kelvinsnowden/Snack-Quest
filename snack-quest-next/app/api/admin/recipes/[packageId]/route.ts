import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { recipeService, RecipeValidationError, SnackItemNotFoundError } from '@/services/recipeService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import type { BoxRecipeItem } from '@/types';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/** Saves or clears one box's recipe (§ Box Recipes). */
export async function PUT(request: Request, { params }: { params: Promise<{ packageId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'products.recipes.manage')) {
    return forbiddenForPermission('products.recipes.manage');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { items, notes } = (body ?? {}) as { items?: unknown; notes?: unknown };
  if (!Array.isArray(items)) {
    return Response.json({ error: 'items must be an array' }, { status: 400 });
  }

  const { packageId } = await params;
  try {
    await recipeService.saveRecipe(
      session.businessId,
      packageId,
      { items: items as BoxRecipeItem[], notes: typeof notes === 'string' ? notes : '' },
      session.uid,
    );
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'box_recipe.save',
      entityType: 'boxRecipe',
      entityId: packageId,
      after: { itemCount: items.length },
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof RecipeValidationError || error instanceof SnackItemNotFoundError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ packageId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'products.recipes.manage')) {
    return forbiddenForPermission('products.recipes.manage');
  }

  const { packageId } = await params;
  await recipeService.deleteRecipe(session.businessId, packageId);
  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.uid,
    action: 'box_recipe.delete',
    entityType: 'boxRecipe',
    entityId: packageId,
    after: null,
  });
  return Response.json({ ok: true });
}
