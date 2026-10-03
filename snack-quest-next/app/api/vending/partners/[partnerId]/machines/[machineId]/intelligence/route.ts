import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { ownerIntelligenceService, PartnerDoesNotOwnMachineError } from '@/services/ownerIntelligenceService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { parseWindowDays } from '@/lib/vending/intelligenceQueryParams';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/**
 * The machine owner's own view (§ OWNER INTELLIGENCE) — staff-facing
 * only, the same as every other partner-financial read in this fleet
 * (no partner login exists yet, § docs/MACHINE_COMMERCE.md §9).
 * Deliberately narrower than the staff intelligence routes: no
 * network-wide category/opportunity data is ever computed for this
 * path (§19).
 */
export async function GET(request: Request, { params }: { params: Promise<{ partnerId: string; machineId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'owner_finance.view')) {
    return forbiddenForPermission('owner_finance.view');
  }

  const { partnerId, machineId } = await params;
  const windowDays = parseWindowDays(request);
  if (windowDays instanceof Response) {
    return windowDays;
  }

  try {
    const summary = await ownerIntelligenceService.getMachineOwnerSummary(session.businessId, partnerId, machineId, windowDays);
    return Response.json({ summary });
  } catch (error) {
    if (error instanceof MachineNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof PartnerDoesNotOwnMachineError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
