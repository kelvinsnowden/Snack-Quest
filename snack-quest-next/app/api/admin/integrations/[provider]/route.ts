import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import {
  integrationSettingsService,
  IntegrationValidationError,
  UnknownIntegrationProviderError,
} from '@/services/integrationSettingsService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/** A single integration's status + masked field values (§ Integration Portal). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { provider } = await params;
  try {
    const integration = await integrationSettingsService.getSummary(session.businessId, provider);
    return Response.json({ integration });
  } catch (error) {
    if (error instanceof UnknownIntegrationProviderError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

/**
 * Edits one integration's credentials, `enabled` flag, or both. Blank
 * fields in the body mean "leave unchanged" (§ IntegrationSettingsService),
 * never the real secret values.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { provider } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return Response.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
  }

  try {
    const { before, after } = await integrationSettingsService.updateSecret(
      session.businessId,
      provider,
      body as Record<string, unknown>,
      session.uid,
    );

    // Never write real secret values to the audit trail — the field
    // views the service already returns are pre-masked.
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'integration.update',
      entityType: 'integrationSecret',
      entityId: provider,
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });

    return Response.json({ integration: after });
  } catch (error) {
    if (error instanceof UnknownIntegrationProviderError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof IntegrationValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not update integration' },
      { status: 400 },
    );
  }
}
