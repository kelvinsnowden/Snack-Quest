import { ADMIN_ONLY } from '@/lib/auth/requireStaffRole';
import { readJsonObject, requiredString, withStaffRoles } from '@/lib/vending/adminIntegrationRoute';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { manufacturerRegistryService, RegistryValidationError } from '@/services/manufacturerRegistryService';

/** Suspends or reactivates a manufacturer. Suspension closes the dispense gate on every one of its machines at once. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withStaffRoles(request, ADMIN_ONLY, async (session) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) {
      return body;
    }
    const status = requiredString(body, 'status');
    if (status !== 'active' && status !== 'suspended') {
      throw new RegistryValidationError('status must be active or suspended');
    }
    await manufacturerRegistryService.setManufacturerStatus(session.businessId, id, status, session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'set_manufacturer_status', entityType: 'manufacturer', entityId: id, after: { status } });
    return Response.json({ ok: true, status });
  });
}
