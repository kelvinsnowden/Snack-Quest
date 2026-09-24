import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { ownerPortalService, PartnerDoesNotOwnMachineError, CameraNotFoundError } from '@/services/ownerPortalService';
import { CameraCapabilityNotSupportedError } from '@/services/cameraService';
import { serializeCameraSnapshot } from '@/lib/vending/serialize';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/** POST — "Take Snapshot" (§ CAMERA tab), owner-scoped. Always `reason: 'manual_capture'` — never `dispense_evidence` from this route. */
export async function POST(request: Request, { params }: { params: Promise<{ cameraId: string }> }): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { cameraId } = await params;
  try {
    const { id, data } = await ownerPortalService.captureCameraSnapshotForOwner(session.businessId, session.partnerId, cameraId, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'capture_camera_snapshot',
      entityType: 'cameraSnapshot',
      entityId: id,
      after: { cameraId, success: data.success },
      machineId: data.machineId,
      source: 'owner_portal',
    });
    return Response.json({ snapshot: serializeCameraSnapshot(id, data) }, { status: 201 });
  } catch (error) {
    if (error instanceof CameraNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof PartnerDoesNotOwnMachineError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof CameraCapabilityNotSupportedError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
