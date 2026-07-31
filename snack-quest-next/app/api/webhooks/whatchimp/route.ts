import { whatchimpGateway } from '@/lib/integrations/whatchimp/whatchimpGateway';
import { webhookEventRepository } from '@/repositories/webhookEventRepository';
import { businessRepository } from '@/repositories/businessRepository';
import { conversationService } from '@/services/conversationService';
import { productService } from '@/services/productService';
import type { WhatsAppInboundMessage } from '@/lib/integrations/types';

/**
 * The real HTTP entry point for the customer journey (PLATFORM_ARCHITECTURE_V2.md
 * §6, §13). GET handles Whatchimp's webhook-verification handshake
 * (platform-level, not tenant-scoped — see `lib/integrations/whatchimp/config.ts`);
 * POST is every inbound customer message, for *every* tenant — one
 * shared URL, disambiguated by which WhatsApp number (`phone_number_id`)
 * received the message.
 */

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const challenge = whatchimpGateway.verifyWebhookChallenge({
    mode: url.searchParams.get('hub.mode') ?? undefined,
    token: url.searchParams.get('hub.verify_token') ?? undefined,
    challenge: url.searchParams.get('hub.challenge') ?? undefined,
  });
  if (challenge === null) {
    return new Response('Forbidden', { status: 403 });
  }
  return new Response(challenge, { status: 200 });
}

export async function POST(request: Request): Promise<Response> {
  const payload = await request.json();

  let inbound;
  try {
    inbound = whatchimpGateway.parseIncomingMessage(payload);
  } catch {
    // Not every webhook delivery is a customer message (delivery
    // receipts, status updates) — 200 so the provider doesn't retry,
    // do nothing with it.
    return new Response(null, { status: 200 });
  }

  // Resolve tenant BEFORE touching anything else — every downstream
  // write (the idempotency record included) must be scoped to the
  // right business, never a default or a guess.
  const business = await businessRepository.findByWhatsappPhoneNumberId(
    inbound.toPhoneNumberId,
  );
  if (!business) {
    // No tenant owns this WhatsApp number — nothing to process, but
    // still 200 so the provider doesn't retry a message the platform
    // isn't configured to receive.
    return new Response(null, { status: 200 });
  }
  const businessId = business.id;

  const idempotency = await webhookEventRepository.recordIfNew({
    businessId,
    provider: 'whatchimp',
    eventKind: 'inbound_message',
    providerEventId: inbound.providerMessageId,
    payload,
  });
  if (!idempotency.isNew) {
    return new Response(null, { status: 200 });
  }

  try {
    if (inbound.catalogOrder) {
      await handleCatalogOrder(businessId, inbound);
    } else {
      await conversationService.start(businessId, inbound.fromPhone, {
        text: inbound.selectedId ?? inbound.text,
        providerMessageId: inbound.providerMessageId,
      });
    }
    await webhookEventRepository.markProcessed(businessId, 'whatchimp', inbound.providerMessageId);
  } catch (error) {
    await webhookEventRepository.markFailed(
      businessId,
      'whatchimp',
      inbound.providerMessageId,
      error instanceof Error ? error.message : 'unknown error',
    );
    // Still 200 — a bug in our own processing shouldn't make Whatchimp retry-storm this message.
  }

  return new Response(null, { status: 200 });
}

/**
 * The secondary catalog-selection path (§ product catalog checkout
 * hand-off): a customer submitted a WhatsApp Product Catalog cart
 * through the generic message webhook rather than Whatchimp calling
 * `/checkout/start` directly. Same validation, same entry point into
 * the conversation engine as that route — this is not a parallel
 * checkout implementation, just a second wire into it.
 *
 * No multi-item cart exists anywhere in this codebase yet (see
 * `types/checkout.ts`'s `CheckoutStartRequest.quantity` note) — only
 * the first item in the cart is acted on; that is today's real,
 * documented limitation, not a silent drop of customer intent.
 */
async function handleCatalogOrder(
  businessId: string,
  inbound: WhatsAppInboundMessage,
): Promise<void> {
  const items = inbound.catalogOrder?.items ?? [];
  const [firstItem] = items;
  if (!firstItem) {
    return;
  }

  const product = await productService.getCheckoutableProduct(businessId, firstItem.productRetailerId);
  await conversationService.startFromCatalogSelection(businessId, inbound.fromPhone, {
    id: firstItem.productRetailerId,
    name: product.name,
    priceKes: product.priceKes,
  });
}
