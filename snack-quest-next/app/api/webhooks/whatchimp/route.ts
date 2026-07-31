import { whatchimpGateway } from '@/lib/integrations/whatchimp/whatchimpGateway';
import { webhookEventRepository } from '@/repositories/webhookEventRepository';
import { conversationService } from '@/services/conversationService';

/**
 * The real HTTP entry point for the customer journey (PLATFORM_ARCHITECTURE_V2.md
 * §6, §13). GET handles Whatchimp's webhook-verification handshake;
 * POST is every inbound customer message.
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

  const idempotency = await webhookEventRepository.recordIfNew({
    provider: 'whatchimp',
    providerEventId: inbound.providerMessageId,
    payload,
  });
  if (!idempotency.isNew) {
    return new Response(null, { status: 200 });
  }

  try {
    await conversationService.start(inbound.fromPhone, {
      text: inbound.selectedId ?? inbound.text,
      providerMessageId: inbound.providerMessageId,
    });
    await webhookEventRepository.markProcessed('whatchimp', inbound.providerMessageId);
  } catch (error) {
    await webhookEventRepository.markFailed(
      'whatchimp',
      inbound.providerMessageId,
      error instanceof Error ? error.message : 'unknown error',
    );
    // Still 200 — a bug in our own processing shouldn't make Whatchimp retry-storm this message.
  }

  return new Response(null, { status: 200 });
}
