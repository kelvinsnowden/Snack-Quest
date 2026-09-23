import { authenticateDevice } from '@/lib/vending/deviceAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { machineTransactionService } from '@/services/machineTransactionService';

/**
 * What a machine polls while waiting for its own payment to resolve
 * (§ device communication architecture, Phase 1: request/response,
 * no push channel exists yet). Scoped to the authenticated machine —
 * a device can only ever learn the status of its own transactions,
 * never enumerate another machine's by guessing an id.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const businessId = getCurrentBusinessId();
  const auth = await authenticateDevice(request, businessId);
  if (!auth.ok) {
    return Response.json({ error: auth.reason }, { status: 401 });
  }

  const { id } = await params;
  const transaction = await machineTransactionService.findById(auth.businessId, id);
  if (!transaction || transaction.machineId !== auth.machineId) {
    return Response.json({ error: `Transaction ${id} not found` }, { status: 404 });
  }

  return Response.json({
    status: transaction.status,
    vendRef: transaction.vendRef,
    failureReason: transaction.failureReason,
  });
}
