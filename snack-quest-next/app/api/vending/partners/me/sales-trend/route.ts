import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { ownerPortalService, PartnerDoesNotOwnMachineError } from '@/services/ownerPortalService';
import { MachineNotFoundError } from '@/repositories/machineRepository';

const ALLOWED_WINDOW_DAYS = new Set([7, 30, 90]);

/** § SALES TREND — daily revenue/units across every machine the partner owns, or one via `?machineId=`. */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const windowDaysParam = Number(url.searchParams.get('windowDays') ?? '30');
  const windowDays = ALLOWED_WINDOW_DAYS.has(windowDaysParam) ? windowDaysParam : 30;
  const machineId = url.searchParams.get('machineId') ?? undefined;

  try {
    const points = await ownerPortalService.getSalesTrend(session.businessId, session.partnerId, windowDays, machineId);
    return Response.json({ points });
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
