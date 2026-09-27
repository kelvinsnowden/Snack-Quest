import { ADMIN_ONLY } from '@/lib/auth/requireStaffRole';
import { readJsonObject, requiredString, withStaffRoles } from '@/lib/vending/adminIntegrationRoute';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { manufacturerRegistryService } from '@/services/manufacturerRegistryService';
import type { ManufacturerOnboardingStage } from '@/types';

/** Moves a manufacturer through onboarding — forward one stage at a time, back to any earlier stage. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withStaffRoles(request, ADMIN_ONLY, async (session) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) {
      return body;
    }
    const stage = requiredString(body, 'stage') as ManufacturerOnboardingStage;
    const before = await manufacturerRegistryService.requireManufacturer(session.businessId, id);
    await manufacturerRegistryService.moveToStage(session.businessId, id, stage, session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'move_manufacturer_stage', entityType: 'manufacturer', entityId: id, before: { stage: before.onboardingStage }, after: { stage } });
    return Response.json({ ok: true, stage });
  });
}
