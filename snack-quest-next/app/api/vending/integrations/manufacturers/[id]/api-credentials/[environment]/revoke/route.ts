import { ADMIN_ONLY } from '@/lib/auth/requireStaffRole';
import { readJsonObject, requiredString, withStaffRoles } from '@/lib/vending/adminIntegrationRoute';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { manufacturerApiCredentialService } from '@/services/manufacturerApiCredentialService';
import type { MachineIntegrationEnvironment } from '@/types';

/**
 * Deletes every stored version of the key, immediately. Every machine of
 * this manufacturer in this environment stops being callable (their vends
 * are refused before anything is sent, and payments for them are
 * declined) until a new key is set.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; environment: string }> }): Promise<Response> {
  const { id, environment } = await params;
  return withStaffRoles(request, ADMIN_ONLY, async (session) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) {
      return body;
    }
    const reason = requiredString(body, 'reason');
    const before = (await manufacturerApiCredentialService.listSummaries(session.businessId, id)).find((c) => c.environment === environment) ?? null;
    await manufacturerApiCredentialService.revoke(session.businessId, id, environment as MachineIntegrationEnvironment, reason, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'revoke_manufacturer_api_credential',
      entityType: 'manufacturerApiCredential',
      entityId: `${id}__${environment}`,
      before: before ? { version: before.current?.version ?? null, fingerprint: before.current?.fingerprint ?? null, status: before.status } : null,
      after: { status: 'revoked', reason },
    });
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
