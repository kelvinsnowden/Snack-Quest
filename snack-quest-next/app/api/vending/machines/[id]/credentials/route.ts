import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { machineService } from '@/services/machineService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { deviceCredentialRepository } from '@/repositories/deviceCredentialRepository';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * A machine's screen keys. `GET` lists them (prefix, dates, status — a
 * stored key can never be read back, only its hash is kept). `POST`
 * issues a new one and returns it exactly once; with `revokeOthers` it
 * also revokes every other active key, for a key that has leaked. Both
 * need `machines.credentials.manage`; the key itself is never audited.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'machines.credentials.manage')) return forbiddenForPermission('machines.credentials.manage');
  const { id } = await params;
  const machine = await machineService.findById(session.businessId, id);
  if (!machine) return Response.json({ error: `Machine ${id} not found` }, { status: 404 });
  const rows = await deviceCredentialRepository.listByMachine(session.businessId, id);
  return Response.json({
    credentials: rows.map(({ id: credentialId, data }) => ({
      id: credentialId,
      prefix: data.secretPrefix,
      issuedAt: data.issuedAt ? data.issuedAt.toDate().toISOString() : null,
      issuedBy: data.issuedBy,
      lastUsedAt: data.lastUsedAt ? data.lastUsedAt.toDate().toISOString() : null,
      revokedAt: data.revokedAt ? data.revokedAt.toDate().toISOString() : null,
      revokedReason: data.revokedReason,
    })),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'machines.credentials.manage')) return forbiddenForPermission('machines.credentials.manage');
  const { id } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (body.revokeOthers !== undefined && typeof body.revokeOthers !== 'boolean') return Response.json({ error: 'revokeOthers must be true or false' }, { status: 400 });
  if (body.reason !== undefined && body.reason !== null && typeof body.reason !== 'string') return Response.json({ error: 'reason must be a string' }, { status: 400 });
  const revokeOthers = body.revokeOthers === true;
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) || null : null;

  try {
    const { issued, revokedIds } = await machineService.replaceDeviceCredential(session.businessId, id, session.uid, { revokeOthers, reason });
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: revokeOthers ? 'replace_device_credential' : 'issue_device_credential',
      entityType: 'deviceCredential',
      entityId: issued.credentialId,
      after: { prefix: issued.secret.slice(0, 8), revokedCredentialIds: revokedIds, reason },
      machineId: id,
    });
    return Response.json({ credential: issued, revokedCredentialIds: revokedIds }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof MachineNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
