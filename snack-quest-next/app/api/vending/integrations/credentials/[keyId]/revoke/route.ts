import { ADMIN_ONLY } from '@/lib/auth/requireStaffRole';
import { readJsonObject, requiredString, withStaffRoles } from '@/lib/vending/adminIntegrationRoute';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { integrationCredentialService } from '@/services/integrationCredentialService';

/** Revocation — immediate on this instance, and within the credential cache TTL (30 s) on every other (lib/vending/credentialCache.ts). */
export async function POST(request: Request, { params }: { params: Promise<{ keyId: string }> }): Promise<Response> {
  const { keyId } = await params;
  return withStaffRoles(request, ADMIN_ONLY, async (session) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) {
      return body;
    }
    const reason = requiredString(body, 'reason');
    await integrationCredentialService.revoke(session.businessId, keyId, reason, session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'revoke_integration_credential', entityType: 'integrationCredential', entityId: keyId, after: { reason } });
    return Response.json({ ok: true });
  });
}
