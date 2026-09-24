import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { cameraService, CameraNotFoundError, CameraCapabilityNotSupportedError } from '@/services/cameraService';
import { serializeCameraSnapshot } from '@/lib/vending/serialize';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import type { CameraSnapshotReason } from '@/types';

const CAMERA_SNAPSHOT_REASONS: CameraSnapshotReason[] = ['dispense_evidence', 'machine_diagnostic', 'fault_evidence', 'admin_test', 'manual_capture'];

/**
 * POST — captures one still image (§6/§7). Every attempt is
 * recorded, success or failure (`cameraService.captureSnapshot`
 * never throws for an ordinary capture/storage failure — only for a
 * missing camera or an unsupported capability). **Never touches a
 * `MachineTransaction`** — `transactionId`, when given, is stored on
 * the resulting `CameraSnapshot` purely as a label for later human
 * review (§ DISPENSE EVIDENCE).
 */
export async function POST(request: Request, { params }: { params: Promise<{ cameraId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { cameraId } = await params;

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { reason, transactionId } = (body ?? {}) as Record<string, unknown>;
  const resolvedReason = typeof reason === 'string' && CAMERA_SNAPSHOT_REASONS.includes(reason as CameraSnapshotReason) ? (reason as CameraSnapshotReason) : 'admin_test';
  if (transactionId !== undefined && typeof transactionId !== 'string') {
    return Response.json({ error: 'transactionId must be a string when provided' }, { status: 400 });
  }

  try {
    const { id, data } = await cameraService.captureSnapshot(session.businessId, {
      cameraId,
      reason: resolvedReason,
      transactionId: (transactionId as string | undefined) ?? null,
      actor: session.uid,
    });
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'capture_camera_snapshot',
      entityType: 'cameraSnapshot',
      entityId: id,
      after: { cameraId, reason: resolvedReason, success: data.success },
      machineId: data.machineId,
    });
    return Response.json({ snapshot: serializeCameraSnapshot(id, data) }, { status: 201 });
  } catch (error) {
    if (error instanceof CameraNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof CameraCapabilityNotSupportedError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
