import { ADMIN_ONLY } from '@/lib/auth/requireStaffRole';
import { readJsonObject, requiredString, withStaffRoles } from '@/lib/vending/adminIntegrationRoute';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { manufacturerRegistryService } from '@/services/manufacturerRegistryService';
import type { CertificationCheckKey, CertificationCheckResult } from '@/types';

/** Records one certification checklist result, with the evidence behind it. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withStaffRoles(request, ADMIN_ONLY, async (session) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) {
      return body;
    }
    const key = requiredString(body, 'key') as CertificationCheckKey;
    const result = { outcome: requiredString(body, 'outcome') as CertificationCheckResult['outcome'], evidence: requiredString(body, 'evidence') };
    await manufacturerRegistryService.recordCertificationCheck(session.businessId, id, key, result, session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'record_certification_check', entityType: 'machineModel', entityId: id, after: { key, ...result } });
    return Response.json({ ok: true });
  });
}
