import { jumiaGateway } from '@/lib/integrations/jumia/jumiaGateway';
import { deliveryService } from '@/services/deliveryService';
import { webhookEventRepository } from '@/repositories/webhookEventRepository';
import { verifyJumiaWebhookRequest } from '@/lib/webhooks/verifyJumiaWebhookRequest';

/**
 * Jumia's courier tracking webhook (§ Logistics: wire tracking webhook
 * consumption, PLATFORM_ARCHITECTURE_V2.md §12). Same per-tenant-URL
 * shape as the Daraja routes (`.../jumia/{businessId}`) since Jumia
 * credentials — and therefore its webhook registration — are
 * per-business like Daraja's, not a shared platform endpoint like
 * Whatchimp's. Thin by design: parsing is `jumiaGateway.parseTrackingWebhook`,
 * idempotency is the shared `webhookEventRepository` ledger every
 * other provider webhook uses, and the actual status transition is
 * `deliveryService.applyTrackingUpdate`.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
): Promise<Response> {
  const { businessId } = await params;
  const verification = await verifyJumiaWebhookRequest(businessId, request);
  if (!verification.ok) {
    return verification.response;
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  let tracking: ReturnType<typeof jumiaGateway.parseTrackingWebhook>;
  try {
    tracking = jumiaGateway.parseTrackingWebhook(payload);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'malformed tracking webhook payload' },
      { status: 400 },
    );
  }

  const providerEventId = `${tracking.courierShipmentRef}:${tracking.status}:${tracking.lastUpdatedAt}`;
  const idempotency = await webhookEventRepository.recordIfNew({
    businessId,
    provider: 'jumia',
    eventKind: 'tracking_update',
    providerEventId,
    payload: payload as Record<string, unknown>,
  });
  if (!idempotency.isNew) {
    return Response.json({ ok: true });
  }

  const match = await deliveryService.applyTrackingUpdate(businessId, tracking);
  if (!match) {
    await webhookEventRepository.markFailed(
      businessId,
      'jumia',
      providerEventId,
      `No shipment found for courierShipmentRef ${tracking.courierShipmentRef}`,
    );
    // Still 200 — an unmatched shipment ref is logged for investigation, not something Jumia should keep retrying.
    return Response.json({ ok: true });
  }

  await webhookEventRepository.markProcessed(businessId, 'jumia', providerEventId);
  return Response.json({ ok: true });
}
