import { authenticateDevice } from '@/lib/vending/deviceAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { machineTelemetryService } from '@/services/machineTelemetryService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { UnrecognisedHardwarePayloadError } from '@/lib/vending/hardwareAdapter';

/**
 * Non-financial telemetry ingest — heartbeat, status, fault,
 * temperature, door, connectivity, stock (§ CORE ENTITIES 5,
 * § OFFLINE BEHAVIOUR). Device-authenticated, never a staff session:
 * this is the one channel a gateway calls directly, and
 * `authenticateDevice` is what stands between an arbitrary POST and
 * `machineTelemetryEventRepository` — the same boundary
 * `docs/VENDING_FOUNDATION.md`'s security section names as
 * non-negotiable ("the vending machine must never write directly to
 * Firestore").
 *
 * The authenticated token's own `machineId` is what's trusted for
 * *which* machine this event belongs to — never a `machineId` field
 * inside the payload itself, which is only handed to the adapter's
 * parser as raw, unverified data.
 */
export async function POST(request: Request): Promise<Response> {
  const businessId = getCurrentBusinessId();
  const auth = await authenticateDevice(request, businessId);
  if (!auth.ok) {
    return Response.json({ error: auth.reason }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  try {
    const result = await machineTelemetryService.ingest({
      businessId: auth.businessId,
      machineId: auth.machineId,
      rawPayload: body,
      source: 'route:telemetry',
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof UnrecognisedHardwarePayloadError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof MachineNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
