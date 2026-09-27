import { ADMIN_OR_WAREHOUSE } from '@/lib/auth/requireStaffRole';
import { withStaffRoles } from '@/lib/vending/adminIntegrationRoute';
import { toJsonSafe } from '@/lib/vending/serializeIntegration';
import { machineIntegrationService } from '@/services/machineIntegrationService';
import { machineReliabilityService } from '@/services/machineReliabilityService';

/** Fleet-wide integration health and hardware reliability over a trailing window (`?days=`, default 30, max 180). */
export async function GET(request: Request): Promise<Response> {
  return withStaffRoles(request, ADMIN_OR_WAREHOUSE, async (session) => {
    const requested = Number(new URL(request.url).searchParams.get('days') ?? '30');
    const days = Number.isFinite(requested) ? Math.min(Math.max(Math.round(requested), 1), 180) : 30;
    const [integrations, reliability] = await Promise.all([
      machineIntegrationService.listIntegrations(session.businessId),
      machineReliabilityService.summarize(session.businessId, days),
    ]);
    return Response.json(toJsonSafe({ integrations, reliability }));
  });
}
