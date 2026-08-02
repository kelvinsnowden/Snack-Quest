import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { integrationSettingsService, UnknownIntegrationProviderError } from '@/services/integrationSettingsService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * "Test Connection" (§ Integration Portal) — makes one real,
 * side-effect-free call to the provider (see each Gateway's
 * `test*Connection` function for exactly what that call is) and
 * records the result. Never mutates production data — no message
 * sent, no shipment created, no payment initiated.
 */
export async function POST(
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
    const result = await integrationSettingsService.testConnection(session.businessId, provider);

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'integration.test_connection',
      entityType: 'integrationSecret',
      entityId: provider,
      after: { success: result.success, error: result.error },
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof UnknownIntegrationProviderError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
