import { randomUUID } from 'node:crypto';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { forbiddenForPermission, hasPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { BulkActionError, machineBulkService, parseBulkRequest, permissionsFor } from '@/services/machineBulkService';

/**
 * `POST /api/vending/machines/bulk` `{ machineIds, action }` — one change
 * to many machines. Needs exactly the permissions the single-machine
 * change needs. Each changed machine gets its own audit entry (so it
 * shows in that machine's history), tied together by a batch id.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  let parsed: ReturnType<typeof parseBulkRequest>;
  try {
    parsed = parseBulkRequest(await request.json().catch(() => null));
  } catch (error) {
    if (error instanceof BulkActionError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
  for (const permission of permissionsFor(parsed.action)) {
    if (!hasPermission(session, permission)) return forbiddenForPermission(permission);
  }

  const batchId = randomUUID();
  const results = await machineBulkService.run(session.businessId, parsed.machineIds, parsed.action, session.uid);
  for (const result of results.filter((entry) => entry.outcome === 'done')) {
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: `bulk_${parsed.action.kind}`,
      entityType: 'machine',
      entityId: result.machineId,
      machineId: result.machineId,
      after: { ...parsed.action, detail: result.detail, batchId },
    });
  }
  return Response.json({ batchId, results });
}
