import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_ONLY, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { machineService, TestVendNotSupportedError } from '@/services/machineService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * `POST` — the diagnostics page's "Test vend" action
 * (§ DIAGNOSTICS PAGE: "Test vend", "Require elevated permission for
 * actual test vend"). Unlike every other diagnostic read on this
 * machine, this one really dispenses product from a live machine —
 * `machineService.testVend` makes the exact same `authorizeVend` call
 * `machineTransactionService` makes after a real payment verifies.
 * `ADMIN_ONLY` is deliberately narrower than
 * `ADMIN_FINANCE_OR_WAREHOUSE`, the role set every other diagnostics
 * read on this page uses — this is the one action here with a real
 * physical/financial consequence, not a read.
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

  const { slotCode } = (body ?? {}) as Record<string, unknown>;
  if (typeof slotCode !== 'string' || slotCode.length === 0) {
    return Response.json({ error: 'slotCode is required' }, { status: 400 });
  }

  try {
    const result = await machineService.testVend(session.businessId, id, slotCode);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'test_vend',
      entityType: 'machine',
      entityId: id,
      after: { slotCode, ...result },
      machineId: id,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof MachineNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof TestVendNotSupportedError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
