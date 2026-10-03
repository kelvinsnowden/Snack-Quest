import { authenticateDevice } from '@/lib/vending/deviceAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { kioskScreenService } from '@/services/kioskScreenService';

/**
 * The artwork a machine's customer screen shows in each placement
 * (§ `KioskScreenImage`) — the machine's own images where it has any,
 * otherwise the fleet-wide ones. Device-authenticated exactly like
 * `GET .../catalog`: a machine reads only its own screen, and any other
 * id reads as not found.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const businessId = getCurrentBusinessId();
  const auth = await authenticateDevice(request, businessId);
  if (!auth.ok) {
    return Response.json({ error: auth.reason }, { status: 401 });
  }
  const { id } = await params;
  if (id !== auth.machineId) {
    return Response.json({ error: `Machine ${id} not found` }, { status: 404 });
  }
  const screen = await kioskScreenService.resolveForMachine(auth.businessId, auth.machineId);
  return Response.json({ screen });
}
