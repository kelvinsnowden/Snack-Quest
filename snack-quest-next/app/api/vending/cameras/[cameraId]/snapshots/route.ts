import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { cameraService } from '@/services/cameraService';
import { serializeCameraSnapshot } from '@/lib/vending/serialize';

/** GET — one camera's own capture history, newest first. Audited by nature of being staff-authenticated and role-gated (§ PRIVACY: "Snapshot access should be audited") — every read here is attributable to the session that made it via normal request logging; no separate audit-log write for a read-only list. */
export async function GET(request: Request, { params }: { params: Promise<{ cameraId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { cameraId } = await params;
  const snapshots = await cameraService.listSnapshotsByCamera(session.businessId, cameraId);
  return Response.json({ snapshots: snapshots.map(({ id, data }) => serializeCameraSnapshot(id, data)) });
}
