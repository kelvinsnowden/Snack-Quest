import { ADMIN_ONLY } from '@/lib/auth/requireStaffRole';
import { withStaffRoles } from '@/lib/vending/adminIntegrationRoute';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { manufacturerApiCredentialService } from '@/services/manufacturerApiCredentialService';
import type { MachineIntegrationEnvironment } from '@/types';

/** Restores the key that the last rotation replaced — for a rotation the manufacturer hadn't activated yet. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; environment: string }> }): Promise<Response> {
  const { id, environment } = await params;
  return withStaffRoles(request, ADMIN_ONLY, async (session) => {
    const before = (await manufacturerApiCredentialService.listSummaries(session.businessId, id)).find((c) => c.environment === environment) ?? null;
    await manufacturerApiCredentialService.rollBack(session.businessId, id, environment as MachineIntegrationEnvironment, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'roll_back_manufacturer_api_credential',
      entityType: 'manufacturerApiCredential',
      entityId: `${id}__${environment}`,
      before: before ? { version: before.current?.version ?? null, fingerprint: before.current?.fingerprint ?? null } : null,
      after: before?.previous ? { version: before.previous.version, fingerprint: before.previous.fingerprint } : null,
    });
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
