import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_ONLY, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { machineTransactionService, DiagnosticVendRequestError, SlotUnavailableForSaleError } from '@/services/machineTransactionService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * `POST` — the diagnostics page's "Test vend" action. It really dispenses
 * product, so it is `ADMIN_ONLY` and audit-logged. It goes through the
 * dispense ledger like a sale (`startDiagnosticVend`): the machine gets a
 * real dispense command the way its integration receives every dispense,
 * the outcome is tracked, and the product leaves stock as `waste`.
 *
 * Body: `{ slotCode, requestId }`. `requestId` identifies this one
 * intended vend (the console generates it when the operator confirms);
 * the same `requestId` again returns the first vend — a double click or
 * a retried request never dispenses twice.
 */
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

  const { slotCode, requestId } = (body ?? {}) as Record<string, unknown>;
  if (typeof slotCode !== 'string' || slotCode.length === 0) {
    return Response.json({ error: 'slotCode is required' }, { status: 400 });
  }
  if (typeof requestId !== 'string' || requestId.length === 0) {
    return Response.json({ error: 'requestId is required — one per intended vend, so a retry never dispenses twice' }, { status: 400 });
  }

  try {
    const result = await machineTransactionService.startDiagnosticVend({ businessId: session.businessId, machineId: id, slotCode, requestId, actor: session.uid });
    if (!result.replay) {
      await recordAuditLog(request, {
        businessId: session.businessId,
        actorId: session.uid,
        action: 'test_vend',
        entityType: 'machine',
        entityId: id,
        after: { slotCode, transactionId: result.transactionId, commandRef: result.commandRef, commandStatus: result.commandStatus, authorized: result.authorized },
        machineId: id,
      });
    }
    return Response.json(result);
  } catch (error) {
    if (error instanceof MachineNotFoundError) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }
    if (error instanceof DiagnosticVendRequestError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SlotUnavailableForSaleError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
