import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { ownerPortalService, PartnerDoesNotOwnMachineError } from '@/services/ownerPortalService';
import { MachineNotFoundError } from '@/repositories/machineRepository';

const ALLOWED_WINDOW_DAYS = new Set([7, 30, 90]);

/** § TOP SELLING PRODUCTS — summed across every machine the partner owns, or one via `?machineId=`. */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const windowDaysParam = Number(url.searchParams.get('windowDays') ?? '30');
  const windowDays = ALLOWED_WINDOW_DAYS.has(windowDaysParam) ? windowDaysParam : 30;
  const machineId = url.searchParams.get('machineId') ?? undefined;
  const limitParam = Number(url.searchParams.get('limit') ?? '10');
  const limit = Number.isInteger(limitParam) && limitParam > 0 && limitParam <= 50 ? limitParam : 10;

  try {
    const products = await ownerPortalService.getTopProducts(session.businessId, session.partnerId, windowDays, machineId, limit);
    return Response.json({ products });
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
