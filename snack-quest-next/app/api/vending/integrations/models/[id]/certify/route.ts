import { ADMIN_ONLY } from '@/lib/auth/requireStaffRole';
import { withStaffRoles } from '@/lib/vending/adminIntegrationRoute';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { manufacturerRegistryService } from '@/services/manufacturerRegistryService';

/** Certifies a model for production — refused (409, with the outstanding checks) unless every required check has passed. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withStaffRoles(request, ADMIN_ONLY, async (session) => {
    await manufacturerRegistryService.certifyModel(session.businessId, id, session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'certify_machine_model', entityType: 'machineModel', entityId: id });
    return Response.json({ ok: true });
  });
}
