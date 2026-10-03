import { authenticateDevice } from '@/lib/vending/deviceAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { machineTransactionService } from '@/services/machineTransactionService';
import { dispenseRecoveryService } from '@/services/dispenseRecoveryService';

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
  let transaction = await machineTransactionService.findById(auth.businessId, id);
  if (!transaction || transaction.machineId !== auth.machineId) {
    return Response.json({ error: `Transaction ${id} not found` }, { status: 404 });
  }
  if (transaction.status === 'paid' || transaction.status === 'vend_authorized') {
    // The customer is standing at the machine polling this: resolve a
    // provably stuck sale now (refund path, or a late dispatch) instead
    // of leaving them waiting for the next sweep. Idempotent and cheap.
    if (await dispenseRecoveryService.recoverTransaction(auth.businessId, id)) {
      transaction = (await machineTransactionService.findById(auth.businessId, id)) ?? transaction;
    }
  }

  return Response.json({
    status: transaction.status,
    vendRef: transaction.vendRef,
    failureReason: transaction.failureReason,
  });
}
