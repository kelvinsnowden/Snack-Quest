import { parseTextSmsDlr } from '@/lib/integrations/sms/parseTextSmsDlr';
import { notificationService } from '@/services/notificationService';
import { webhookEventRepository } from '@/repositories/webhookEventRepository';
import { checkWebhookSecret } from '@/lib/webhooks/webhookSecret';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';

/**
 * TextSMS's delivery-report callback (§ TextSMS delivery reports) — the
 * URL pasted into the callback field in the TextSMS dashboard. Fills in
 * `outboundMessages.deliveredAt`, which nothing wrote before this
 * existed: `markSent` only ever meant "the aggregator accepted it",
 * never "the handset received it".
 *
 * Platform-wide rather than per-tenant like the Daraja and Jumia
 * routes, because the SMS account itself is (see `SmsGateway`'s comment
 * in `lib/integrations/types.ts` — one credential per deployment, not
 * one per business). The tenant therefore comes from
 * `getCurrentBusinessId()`, the same contract every other deployment-
 * scoped surface uses.
 *
 * Both verbs are handled. TextSMS documents neither — their Postman
 * collection covers only the pull-based `getdlr/` API and contains no
 * callback example at all — and aggregators split roughly evenly
 * between POSTing a body and GETting a query string, so supporting both
 * costs one export and removes a whole class of silent failure.
 *
 * Unlike the Daraja/Whatchimp routes, the shared secret here is
 * fail-CLOSED. Those two fail open because the check was retrofitted
 * onto routes already carrying real production payments, where
 * rejecting everything before an operator had provisioned a secret
 * would have broken live checkout. This route is new, carries no
 * traffic yet, and only enriches records that are already correct
 * without it — so there is no comparable cost to being strict from the
 * first request, and an unauthenticated writer could otherwise mark
 * real messages bounced.
 */

const PROVIDER = 'textsms' as const;
const EVENT_KIND = 'sms_dlr' as const;

function checkSharedSecret(request: Request): Response | null {
  const expected = process.env.TEXTSMS_DLR_SECRET;
  if (!expected) {
    console.warn(
      '[textsms dlr] TEXTSMS_DLR_SECRET is not configured — rejecting the callback. Set it, then register the callback URL in the TextSMS dashboard with ?key=<secret> appended.',
    );
    return new Response('Forbidden', { status: 403 });
  }

  const provided = new URL(request.url).searchParams.get('key');
  if (!checkWebhookSecret(provided, expected).ok) {
    console.warn('[textsms dlr] rejected a callback with a missing or wrong key.');
    return new Response('Forbidden', { status: 403 });
  }
  return null;
}

/**
 * Accepts JSON, form-encoded, and query-string payloads, merged with
 * the body winning — again because the real content type is
 * undocumented. `key` is stripped so the shared secret is never
 * persisted into the `webhookEvents` ledger alongside the payload.
 */
async function readPayload(request: Request): Promise<Record<string, unknown>> {
  const url = new URL(request.url);
  const fromQuery: Record<string, unknown> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (key !== 'key') {
      fromQuery[key] = value;
    }
  }

  if (request.method === 'GET') {
    return fromQuery;
  }

  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      const body = await request.json();
      return typeof body === 'object' && body !== null
        ? { ...fromQuery, ...(body as Record<string, unknown>) }
        : fromQuery;
    }
    if (contentType.includes('form')) {
      const form = await request.formData();
      const fromBody: Record<string, unknown> = {};
      for (const [key, value] of form.entries()) {
        fromBody[key] = typeof value === 'string' ? value : value.name;
      }
      return { ...fromQuery, ...fromBody };
    }

    // No usable content-type header: try JSON, and fall back to the
    // query string rather than rejecting a callback we might otherwise
    // have understood.
    const text = await request.text();
    if (text.trim() === '') {
      return fromQuery;
    }
    const parsed = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null
      ? { ...fromQuery, ...(parsed as Record<string, unknown>) }
      : fromQuery;
  } catch {
    return fromQuery;
  }
}

async function handle(request: Request): Promise<Response> {
  const rejection = checkSharedSecret(request);
  if (rejection) {
    return rejection;
  }

  const businessId = getCurrentBusinessId();
  const payload = await readPayload(request);
  const report = parseTextSmsDlr(payload);

  if (!report) {
    // Nothing to correlate this with. Logged loudly because it almost
    // certainly means the real field names differ from the aliases
    // `parseTextSmsDlr` guesses at — this line is what turns the first
    // live callback into the fix.
    console.warn('[textsms dlr] callback carried no recognisable message id. Raw payload:', JSON.stringify(payload));
    return Response.json({ ok: true });
  }

  // One message legitimately produces several reports as it moves
  // through the network (submitted, then delivered), so the status is
  // part of the dedup key — otherwise only the first would ever apply.
  const providerEventId = `${report.providerMessageId}:${report.rawStatus ?? 'unknown'}`;
  const idempotency = await webhookEventRepository.recordIfNew({
    businessId,
    provider: PROVIDER,
    eventKind: EVENT_KIND,
    providerEventId,
    payload,
  });
  if (!idempotency.isNew) {
    return Response.json({ ok: true });
  }

  const result = await notificationService.applySmsDeliveryReport(businessId, report);

  if (result.outcome === 'ignored') {
    if (result.outboundMessageId === null) {
      await webhookEventRepository.markFailed(
        businessId,
        PROVIDER,
        providerEventId,
        `No outbound message found for provider message id ${report.providerMessageId}`,
      );
    } else {
      // A real, matched message whose status simply isn't actionable —
      // recorded as processed, since nothing went wrong.
      await webhookEventRepository.markProcessed(businessId, PROVIDER, providerEventId);
      console.info(
        `[textsms dlr] unactioned status "${report.rawStatus ?? 'none'}" for message ${report.providerMessageId} — recorded, record unchanged.`,
      );
    }
    // 200 either way: a callback for a message this deployment never
    // sent is something to investigate in the ledger, not something
    // TextSMS should keep redelivering.
    return Response.json({ ok: true });
  }

  await webhookEventRepository.markProcessed(businessId, PROVIDER, providerEventId);
  return Response.json({ ok: true });
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}
