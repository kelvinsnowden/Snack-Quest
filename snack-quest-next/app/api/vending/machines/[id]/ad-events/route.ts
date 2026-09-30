import { authenticateDevice } from '@/lib/vending/deviceAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { advertisingService, AdValidationError } from '@/services/advertisingService';

/**
 * A machine reports ad playback (§ PLAYBACK EVENTS): `{ packageVersion,
 * events: [{ clientEventId, campaignId, creativeId, eventType, occurredAt,
 * playedMs?, failureReason? }] }`, at most 100 per call. Device-
 * authenticated; a machine reports only for itself. Resending a batch is
 * safe: each client event id counts once.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const businessId = getCurrentBusinessId();
  const auth = await authenticateDevice(request, businessId);
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: 401 });
  const { id } = await params;
  if (id !== auth.machineId) return Response.json({ error: `Machine ${id} not found` }, { status: 404 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  try {
    return Response.json(await advertisingService.recordPlayback(auth.businessId, auth.machineId, body));
  } catch (error) {
    if (error instanceof AdValidationError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
