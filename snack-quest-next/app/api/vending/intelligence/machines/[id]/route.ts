import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { machineAssortmentIntelligenceService } from '@/services/machineAssortmentIntelligenceService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { parseWindowDays } from '@/lib/vending/intelligenceQueryParams';

/**
 * One machine's own intelligence view (§ MACHINE-SPECIFIC ASSORTMENT
 * INTELLIGENCE, § ASSORTMENT PERFORMANCE): the four catalog layers
 * (global/assortment/stocked/sellable) and per-slot performance
 * (dead/stockout/high-velocity/underperforming), together.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { id } = await params;
  const windowDays = parseWindowDays(request);
  if (windowDays instanceof Response) {
    return windowDays;
  }

  try {
    const [layers, performance] = await Promise.all([
      machineAssortmentIntelligenceService.classifyMachineCatalogLayers(session.businessId, id),
      machineAssortmentIntelligenceService.getAssortmentPerformance(session.businessId, id, windowDays),
    ]);
    return Response.json({ layers, performance });
  } catch (error) {
    if (error instanceof MachineNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
