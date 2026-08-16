import {
  hasStaffRole,
  ADMIN_ONLY,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  businessSettingsService,
  BusinessNotFoundError,
  BusinessSettingsValidationError,
  type BusinessSettingsPatch,
} from '@/services/businessSettingsService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/** Reads this tenant's own Business config (§ Admin: Settings). */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  try {
    const business = await businessSettingsService.getSettings(
      session.businessId,
    );
    return Response.json({ business });
  } catch (error) {
    if (error instanceof BusinessNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

const EDITABLE_FIELDS = [
  'name',
  'currency',
  'whatsappPhoneNumberId',
  'countyCoverage',
  'adminWhatsappPhone',
  'whatsappCustomerNumber',
  'status',
  'loyaltyConfig',
  'homepageContent',
] as const;

function pickPatch(body: Record<string, unknown>): BusinessSettingsPatch {
  const patch: BusinessSettingsPatch = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) {
      (patch as Record<string, unknown>)[field] = body[field];
    }
  }
  return patch;
}

/** Edits this tenant's own Business config, writing a before/after audit log entry (§ Admin: Settings, § Admin: Audit Logs). */
export async function PATCH(request: Request): Promise<Response> {
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

  const patch = pickPatch((body ?? {}) as Record<string, unknown>);
  if (Object.keys(patch).length === 0) {
    return Response.json(
      { error: 'No editable fields provided.' },
      { status: 400 },
    );
  }

  try {
    const { before, after } = await businessSettingsService.updateSettings(
      session.businessId,
      patch,
      session.uid,
    );
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'business_settings.update',
      entityType: 'business',
      entityId: session.businessId,
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
    return Response.json({ business: after });
  } catch (error) {
    if (error instanceof BusinessNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof BusinessSettingsValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not update settings',
      },
      { status: 400 },
    );
  }
}
