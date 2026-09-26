import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_ONLY, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { cameraService } from '@/services/cameraService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { serializeCamera } from '@/lib/vending/serialize';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import type { CameraType } from '@/types';

const CAMERA_TYPES: CameraType[] = ['usb', 'ip', 'rtsp', 'onvif', 'manufacturer_specific', 'mock'];

/** GET — every camera registered to this machine (§ CAMERA TYPES: a machine may carry zero, one, or several). Read-only diagnostics tier, same as the machine's own capability/telemetry reads. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { id } = await params;
  const cameras = await cameraService.listByMachine(session.businessId, id);
  return Response.json({ cameras: cameras.map(({ id: cameraId, data }) => serializeCamera(cameraId, data)) });
}

/** POST — registers a new camera against this machine (§ CAMERA CONFIGURATION step 1/2). Lands on `not_configured`; connection details are a separate `configure` call. `ADMIN_ONLY` — the same bar every other camera-configuration write in this file uses. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { type, manufacturer, model, serialNumber, label } = (body ?? {}) as Record<string, unknown>;
  if (typeof type !== 'string' || !CAMERA_TYPES.includes(type as CameraType)) {
    return Response.json({ error: `type must be one of ${CAMERA_TYPES.join(', ')}` }, { status: 400 });
  }
  if (typeof label !== 'string' || label.trim().length === 0) {
    return Response.json({ error: 'label is required' }, { status: 400 });
  }

  try {
    const cameraId = await cameraService.registerCamera(
      session.businessId,
      {
        machineId: id,
        type: type as CameraType,
        manufacturer: typeof manufacturer === 'string' ? manufacturer : null,
        model: typeof model === 'string' ? model : null,
        serialNumber: typeof serialNumber === 'string' ? serialNumber : null,
        label: label.trim(),
      },
      session.uid,
    );
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'register_camera',
      entityType: 'camera',
      entityId: cameraId,
      after: { machineId: id, type, label },
      machineId: id,
    });
    return Response.json({ id: cameraId }, { status: 201 });
  } catch (error) {
    if (error instanceof MachineNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
