import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_ONLY, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { machineSubscriptionService, MachineAlreadyHasActiveSubscriptionError } from '@/services/machineSubscriptionService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { serializeMachineSubscription } from '@/lib/vending/serialize';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import type { MachineSubscriptionFrequency } from '@/types';

const VALID_FREQUENCIES: MachineSubscriptionFrequency[] = ['weekly', 'monthly'];

/**
 * A machine's own recurring maintenance/operations subscription
 * (§ SUBSCRIPTION, docs/MACHINE_COMMERCE.md §5). Financial — gated
 * `ADMIN_ONLY` for the write, the same bar every other real
 * money-affecting write in this codebase (withdrawals, settlements)
 * sits behind; `GET` is a finance/warehouse read, same as the reserve
 * and slots endpoints.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { id } = await params;
  const found = await machineSubscriptionService.findActiveForMachine(session.businessId, id);
  return Response.json({ subscription: found ? serializeMachineSubscription(found.id, found.data) : null });
}

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

  const { partnerId, planName, amountKes, frequency } = (body ?? {}) as Record<string, unknown>;
  if (typeof partnerId !== 'string' || !partnerId) {
    return Response.json({ error: 'partnerId is required' }, { status: 400 });
  }
  if (typeof planName !== 'string' || !planName) {
    return Response.json({ error: 'planName is required' }, { status: 400 });
  }
  if (typeof amountKes !== 'number' || !Number.isFinite(amountKes) || amountKes <= 0) {
    return Response.json({ error: 'amountKes must be a positive number' }, { status: 400 });
  }
  if (typeof frequency !== 'string' || !VALID_FREQUENCIES.includes(frequency as MachineSubscriptionFrequency)) {
    return Response.json({ error: `frequency must be one of: ${VALID_FREQUENCIES.join(', ')}` }, { status: 400 });
  }

  try {
    const subscriptionId = await machineSubscriptionService.createSubscription({
      businessId: session.businessId,
      machineId: id,
      partnerId,
      planName,
      amountKes,
      frequency: frequency as MachineSubscriptionFrequency,
    });
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'create_subscription',
      entityType: 'machineSubscription',
      entityId: subscriptionId,
      after: { machineId: id, partnerId, planName, amountKes, frequency },
      machineId: id,
    });
    return Response.json({ subscriptionId }, { status: 201 });
  } catch (error) {
    if (error instanceof MachineNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof MachineAlreadyHasActiveSubscriptionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
