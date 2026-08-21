import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_ONLY, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { recipeService, RecipeValidationError } from '@/services/recipeService';
import { serializeSnackItem } from '@/lib/recipes/serialize';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { parseSnackItemBody } from '@/lib/recipes/parseSnackItemBody';

/** The snack catalogue (§ Box Recipes). Admin rather than super-admin: keeping it current is routine operational work, and gating it higher is how prices go stale. */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const activeOnly = new URL(request.url).searchParams.get('activeOnly') === 'true';
  const items = await recipeService.listSnackItems(session.businessId, { activeOnly });
  return Response.json({ items: items.map(({ id, data }) => serializeSnackItem(id, data)) });
}

export async function POST(request: Request): Promise<Response> {
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

  try {
    const itemId = await recipeService.createSnackItem(session.businessId, parsed.draft, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'snack_item.create',
      entityType: 'snackItem',
      entityId: itemId,
      before: null,
      after: { name: parsed.draft.name, expectedUnitCostKes: parsed.draft.expectedUnitCostKes },
    });
    return Response.json({ itemId }, { status: 201 });
  } catch (error) {
    if (error instanceof RecipeValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
