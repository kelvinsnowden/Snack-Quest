import {
  hasStaffRole,
  ADMIN_ONLY,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import {
  featureFlagService,
  UnknownFeatureFlagError,
} from '@/services/featureFlagService';

interface SetFlagBody {
  key?: unknown;
  enabled?: unknown;
}

/** Lists every known feature flag with its effective value for this tenant (§ Phase 6: Feature flags). */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const flags = await featureFlagService.listFlags(session.businessId);
  return Response.json({ flags });
}

/** Toggles one flag, runtime-effective immediately — no rebuild, no redeploy. */
export async function PATCH(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  let body: SetFlagBody;
  try {
    body = (await request.json()) as SetFlagBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (typeof body.key !== 'string' || typeof body.enabled !== 'boolean') {
    return Response.json(
      { error: '"key" (string) and "enabled" (boolean) are required.' },
      { status: 400 },
    );
  }

  try {
    const flag = await featureFlagService.setEnabled(
      session.businessId,
      body.key,
      body.enabled,
      session.uid,
    );

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'featureFlag.set',
      entityType: 'featureFlag',
      entityId: body.key,
      after: { enabled: body.enabled },
    });

    return Response.json({ flag });
  } catch (error) {
    if (error instanceof UnknownFeatureFlagError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not update this flag.',
      },
      { status: 400 },
    );
  }
}
