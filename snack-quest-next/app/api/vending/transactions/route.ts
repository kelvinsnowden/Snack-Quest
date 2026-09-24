import { authenticateDevice } from '@/lib/vending/deviceAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { machineTransactionService } from '@/services/machineTransactionService';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { UnrecognisedHardwarePayloadError } from '@/lib/vending/hardwareAdapter';
import { serializeMachineTransaction } from '@/lib/vending/serialize';
import type { MachineTransactionStatus } from '@/types';

const VALID_STATUSES: MachineTransactionStatus[] = [
  'pending',
  'payment_failed',
  'paid',
  'vend_authorized',
  'dispensed',
  'paid_vend_failed',
  'refund_requested',
  'refunded',
  'manual_review',
];

/**
 * `POST` — a device's own report of what happened to a vend
 * (§ financial correctness, § idempotency). Device-authenticated;
 * this is the *only* transaction write a device can reach, and it
 * can only ever move a `paid`/`vend_authorized` transaction to
 * `dispensed`/`paid_vend_failed` — never create one, never mark one
 * paid. Those remain server-side calls into
 * `machineTransactionService` from wherever payment verification
 * happens, with no route here that accepts a device's claim as
 * proof of payment.
 *
 * `GET` — the staff/finance list view over real transactions, bounded
 * and paginated like every other admin list in this codebase, never
 * the unbounded `streamRange` a rollup rebuild uses.
 */
export async function POST(request: Request): Promise<Response> {
  const businessId = getCurrentBusinessId();
  const auth = await authenticateDevice(request, businessId);
  if (!auth.ok) {
    return Response.json({ error: auth.reason }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  try {
    const result = await machineTransactionService.applyVendResult({
      businessId: auth.businessId,
      machineId: auth.machineId,
      rawPayload: body,
      source: 'route:transactions',
      actor: `device:${auth.credentialId}`,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof UnrecognisedHardwarePayloadError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof MachineNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const url = new URL(request.url);
  const machineId = url.searchParams.get('machineId') ?? undefined;
  const statusParam = url.searchParams.get('status');
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const limitParam = url.searchParams.get('limit');

  if (statusParam && !VALID_STATUSES.includes(statusParam as MachineTransactionStatus)) {
    return Response.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }
  let limit: number | undefined;
  if (limitParam) {
    limit = Number(limitParam);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      return Response.json({ error: 'limit must be an integer between 1 and 200' }, { status: 400 });
    }
  }

  const { transactions, nextCursor } = await machineTransactionRepository.listByBusiness(session.businessId, {
    machineId,
    status: statusParam as MachineTransactionStatus | undefined,
    limit,
    cursor,
  });

  return Response.json({
    transactions: transactions.map(({ id, data }) => serializeMachineTransaction(id, data)),
    nextCursor,
  });
}
