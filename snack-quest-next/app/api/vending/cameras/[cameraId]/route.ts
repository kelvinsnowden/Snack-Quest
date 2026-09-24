import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { cameraService, CameraNotFoundError } from '@/services/cameraService';
import { serializeCamera } from '@/lib/vending/serialize';

/** GET — one camera plus its live, four-way capability read (§1) — the same "compute fresh, never cache a decision" pattern the vending diagnostics panel already uses. */
export async function GET(request: Request, { params }: { params: Promise<{ cameraId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { cameraId } = await params;
  const camera = await cameraService.findById(session.businessId, cameraId);
  if (!camera) {
    return Response.json({ error: new CameraNotFoundError(cameraId).message }, { status: 404 });
  }

  const diagnostics = await cameraService.getDiagnostics(camera);
  return Response.json({ camera: serializeCamera(cameraId, camera), diagnostics });
}
