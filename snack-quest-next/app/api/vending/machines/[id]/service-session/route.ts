import { authenticateDevice } from '@/lib/vending/deviceAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { ServiceCodeError, kioskRuntimeService } from '@/services/kioskRuntimeService';

/**
 * The machine's screen opens service mode with a one-time code
 * (§ KIOSK SERVICE MODE). Device-authenticated: a code only works on the
 * machine it was issued for. Service mode is a diagnostics screen on the
 * kiosk — it grants no machine commands and no staff access.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const businessId = getCurrentBusinessId();
  const auth = await authenticateDevice(request, businessId);
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: 401 });
  const { id } = await params;
  if (id !== auth.machineId) return Response.json({ error: `Machine ${id} not found` }, { status: 404 });
  let body: Record<string, unknown> = {};
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  try {
    const session = await kioskRuntimeService.redeemServiceCode(auth.businessId, auth.machineId, body.code);
    await recordAuditLog(request, { businessId: auth.businessId, actorId: `machine:${auth.machineId}`, action: 'machine.service_mode_opened', entityType: 'machine', entityId: auth.machineId, after: { codeId: session.codeId, issuedBy: session.issuedBy }, source: 'machine_screen', machineId: auth.machineId });
    return Response.json({ sessionExpiresAt: session.sessionExpiresAt.toISOString() });
  } catch (error) {
    if (error instanceof ServiceCodeError) return Response.json({ error: error.message }, { status: error.reason === 'locked' ? 429 : 403 });
    throw error;
  }
}
