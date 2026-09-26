import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_ONLY, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { cameraService, CameraNotFoundError, IllegalCameraTransitionError } from '@/services/cameraService';
import { cameraRepository } from '@/repositories/cameraRepository';
import { serializeCamera } from '@/lib/vending/serialize';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * PATCH — saves connection configuration (§ CAMERA CONFIGURATION
 * steps 3/5). `ADMIN_ONLY`: this is the one route that ever accepts
 * a plaintext password/API key over the wire — everything downstream
 * (`cameraService.configureCamera`) encrypts before persisting, and
 * the audit entry below records only which fields were set, never
 * their values (§ SECURITY: "Audit administrative camera
 * configuration changes" without logging the secret itself).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ cameraId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const { cameraId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { host, port, streamPath, username, password, apiKey, onvifProfileToken } = (body ?? {}) as Record<string, unknown>;
  if (port !== undefined && port !== null && typeof port !== 'number') {
    return Response.json({ error: 'port must be a number or null' }, { status: 400 });
  }

  try {
    await cameraService.configureCamera(
      session.businessId,
      cameraId,
      {
        host: typeof host === 'string' ? host : null,
        port: typeof port === 'number' ? port : null,
        streamPath: typeof streamPath === 'string' ? streamPath : null,
        username: typeof username === 'string' ? username : null,
        password: typeof password === 'string' ? password : null,
        apiKey: typeof apiKey === 'string' ? apiKey : null,
        onvifProfileToken: typeof onvifProfileToken === 'string' ? onvifProfileToken : null,
      },
      session.uid,
    );
    const camera = await cameraRepository.findById(session.businessId, cameraId);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'configure_camera',
      entityType: 'camera',
      entityId: cameraId,
      // Which fields were set, never their values — a password/API
      // key changing hands is auditable without the audit log itself
      // becoming a place a secret leaks.
      after: { fieldsSet: Object.keys({ host, port, streamPath, username, password, apiKey, onvifProfileToken }).filter((key) => (body as Record<string, unknown>)[key] != null) },
      machineId: camera?.machineId ?? null,
    });
    return Response.json({ camera: camera ? serializeCamera(cameraId, camera) : null });
  } catch (error) {
    if (error instanceof CameraNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof IllegalCameraTransitionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
