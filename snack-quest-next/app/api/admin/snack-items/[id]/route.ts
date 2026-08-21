import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_ONLY, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { recipeService, RecipeValidationError, SnackItemNotFoundError } from '@/services/recipeService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { parseSnackItemBody } from '@/lib/recipes/parseSnackItemBody';

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
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
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
    await recipeService.updateSnackItem(session.businessId, id, parsed.draft, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'snack_item.update',
      entityType: 'snackItem',
      entityId: id,
      before: { name: before.name, expectedUnitCostKes: before.expectedUnitCostKes },
      after: { name: parsed.draft.name, expectedUnitCostKes: parsed.draft.expectedUnitCostKes },
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
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
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
