import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { machineService } from '@/services/machineService';
import { deviceCredentialRepository } from '@/repositories/deviceCredentialRepository';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * Revokes one screen key at once (`machines.credentials.manage`). The
 * very next request signed with it is refused; a screen still using it
 * drops back to its pairing page. A reason is required and kept.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; credentialId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'machines.credentials.manage')) return forbiddenForPermission('machines.credentials.manage');
  const { id, credentialId } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : '';
  if (!reason) return Response.json({ error: 'Say why the key is being revoked.' }, { status: 400 });

  // The key must belong to this machine in this business — never revoke by id alone.
  const credential = await deviceCredentialRepository.findById(session.businessId, credentialId);
  if (!credential || credential.machineId !== id) return Response.json({ error: 'Key not found for this machine.' }, { status: 404 });
  if (credential.revokedAt) return Response.json({ error: 'That key is already revoked.' }, { status: 409 });

  await machineService.revokeDeviceCredential(session.businessId, credentialId, session.uid, reason);
  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.uid,
    action: 'revoke_device_credential',
    entityType: 'deviceCredential',
    entityId: credentialId,
    before: { prefix: credential.secretPrefix, revoked: false },
    after: { revoked: true, reason },
    machineId: id,
  });
  return Response.json({ ok: true });
}
