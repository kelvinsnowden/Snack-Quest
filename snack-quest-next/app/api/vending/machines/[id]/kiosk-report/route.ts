import { authenticateDevice } from '@/lib/vending/deviceAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { KioskReportValidationError, kioskRuntimeService } from '@/services/kioskRuntimeService';

/**
 * The machine screen's periodic report (§ KIOSK OBSERVABILITY, § KIOSK
 * ANALYTICS): `{ batchId, packageVersion, catalogVersion, runtimeState,
 * pendingAdEvents, cachedCreatives, counts: { session_started, … } }`.
 * Device-authenticated; a machine reports only for itself; a resent batch
 * counts once. Counts only — nothing identifies a customer.
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
    return Response.json(await kioskRuntimeService.recordReport(auth.businessId, auth.machineId, body));
  } catch (error) {
    if (error instanceof KioskReportValidationError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
