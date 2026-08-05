import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  fulfillmentBatchService,
  InvalidFulfillmentBatchInputError,
  OrderAlreadyBatchedError,
  OrderNotEligibleForBatchError,
  OrderNotFoundError,
} from '@/services/fulfillmentBatchService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

interface CreateFulfillmentBatchBody {
  orderIds?: unknown;
  productsPurchasedKes?: unknown;
  packagingKes?: unknown;
  deliveryKes?: unknown;
  miscKes?: unknown;
  notes?: unknown;
}

function validateOrderIds(raw: unknown): { error: string } | { orderIds: string[] } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: '"orderIds" must be a non-empty array.' };
  }
  const orderIds: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !item) {
      return { error: 'Each entry in "orderIds" must be a non-empty string.' };
    }
    orderIds.push(item);
  }
  return { orderIds };
}

function validateOptionalCost(raw: unknown, label: string): { error: string } | { value: number | undefined } {
  if (raw === undefined) {
    return { value: undefined };
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    return { error: `"${label}" must be a non-negative number when provided.` };
  }
  return { value: raw };
}

/** Creates a fulfillment batch (§ Fulfillment Batches) — one real shopping trip closing out several orders at once. */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: CreateFulfillmentBatchBody;
  try {
    body = (await request.json()) as CreateFulfillmentBatchBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const orderIdsResult = validateOrderIds(body.orderIds);
  if ('error' in orderIdsResult) {
    return Response.json({ error: orderIdsResult.error }, { status: 400 });
  }
  if (typeof body.productsPurchasedKes !== 'number' || !Number.isFinite(body.productsPurchasedKes) || body.productsPurchasedKes < 0) {
    return Response.json({ error: '"productsPurchasedKes" is required and must be a non-negative number.' }, { status: 400 });
  }
  const packagingResult = validateOptionalCost(body.packagingKes, 'packagingKes');
  if ('error' in packagingResult) {
    return Response.json({ error: packagingResult.error }, { status: 400 });
  }
  const deliveryResult = validateOptionalCost(body.deliveryKes, 'deliveryKes');
  if ('error' in deliveryResult) {
    return Response.json({ error: deliveryResult.error }, { status: 400 });
  }
  const miscResult = validateOptionalCost(body.miscKes, 'miscKes');
  if ('error' in miscResult) {
    return Response.json({ error: miscResult.error }, { status: 400 });
  }
  if (body.notes !== undefined && typeof body.notes !== 'string') {
    return Response.json({ error: '"notes" must be a string when provided.' }, { status: 400 });
  }

  try {
    const fulfillmentBatchId = await fulfillmentBatchService.createFulfillmentBatch(
      session.businessId,
      {
        orderIds: orderIdsResult.orderIds,
        productsPurchasedKes: body.productsPurchasedKes,
        packagingKes: packagingResult.value,
        deliveryKes: deliveryResult.value,
        miscKes: miscResult.value,
        notes: body.notes as string | undefined,
      },
      session.uid,
    );

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'fulfillment_batch.create',
      entityType: 'fulfillmentBatch',
      entityId: fulfillmentBatchId,
      after: { orderCount: orderIdsResult.orderIds.length },
    });

    return Response.json({ fulfillmentBatchId }, { status: 201 });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof OrderAlreadyBatchedError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof OrderNotEligibleForBatchError || error instanceof InvalidFulfillmentBatchInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : 'Could not create fulfillment batch' }, { status: 400 });
  }
}
