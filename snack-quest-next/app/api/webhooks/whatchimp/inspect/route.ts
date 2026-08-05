import { webhookInspectionRepository } from '@/repositories/webhookInspectionRepository';
import { checkWebhookSecret } from '@/lib/webhooks/webhookSecret';

/**
 * ⚠️ TEMPORARY DIAGNOSTIC — DELETE once
 * `WhatchimpGateway.parseIncomingMessage` has been rewritten from a
 * real capture (see that method's doc comment).
 *
 * WhatChimp's developer console documents its outbound REST API in
 * full but publishes no schema for the payload its "Trigger Webhook
 * for Incoming Message" setting sends us. This records one real
 * request — method, URL, query params, headers, content type, raw and
 * parsed body, remote IP — and always returns 200 so WhatChimp never
 * marks the endpoint failing and retries.
 *
 * Point WhatChimp's Incoming Webhook URL here, send one WhatsApp
 * message, then read it back with
 * `webhookInspectionRepository.listRecent()`.
 *
 * Two questions the capture has to settle:
 *   1. is there a `phone_number_id` (or any stable tenant identifier)?
 *      If not, tenant resolution moves to per-business webhook URLs,
 *      the pattern Daraja and Jumia already use.
 *   2. how does a tapped reply button arrive? `sendButtons` sets an
 *      `id` per button that WhatChimp says comes back on the
 *      button-reply payload.
 */

/**
 * Header values that could carry a credential. The *name* is always
 * kept (knowing an `x-hub-signature-256` exists is exactly the kind of
 * thing this capture is for) but the value is reduced to a length
 * summary — enough to recognise an HMAC without persisting a secret
 * into Firestore.
 */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-api-key',
  'apitoken',
  'x-checkout-api-key',
  'x-hub-signature',
  'x-hub-signature-256',
  'x-signature',
  'x-webhook-signature',
]);

/** Firestore documents cap at 1MB; a real inbound message is orders of magnitude smaller, so this only ever trips on something pathological. */
const MAX_RAW_BODY_CHARS = 64_000;

function maskHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = SENSITIVE_HEADERS.has(key.toLowerCase())
      ? `<redacted: ${value.length} chars>`
      : value;
  });
  return headers;
}

function parseBody(
  rawBody: string,
  contentType: string | null,
): { bodyFormat: 'json' | 'form' | 'unparsed'; parsedBody: unknown } {
  if (!rawBody) {
    return { bodyFormat: 'unparsed', parsedBody: null };
  }

  // Checked before JSON because WhatChimp's own outbound API is
  // entirely form-encoded — there's a real chance its webhook is too,
  // and a form body would otherwise land as an opaque string.
  if (contentType?.includes('application/x-www-form-urlencoded')) {
    return {
      bodyFormat: 'form',
      parsedBody: Object.fromEntries(new URLSearchParams(rawBody)),
    };
  }

  try {
    return { bodyFormat: 'json', parsedBody: JSON.parse(rawBody) };
  } catch {
    return { bodyFormat: 'unparsed', parsedBody: null };
  }
}

async function capture(request: Request): Promise<Response> {
  // Same fail-open-until-configured discipline as the production
  // Whatchimp webhook: set WHATCHIMP_WEBHOOK_SECRET and append
  // `?key=<secret>` to the URL registered with WhatChimp to lock this
  // down, but don't make an unconfigured secret block the very capture
  // this endpoint exists to perform.
  const url = new URL(request.url);
  const secretResult = checkWebhookSecret(url.searchParams.get('key'), process.env.WHATCHIMP_WEBHOOK_SECRET);
  if (!secretResult.ok) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const rawBody = await request.text();
    const truncated = rawBody.length > MAX_RAW_BODY_CHARS;
    const contentType = request.headers.get('content-type');
    const { bodyFormat, parsedBody } = parseBody(rawBody, contentType);

    const inspectionId = await webhookInspectionRepository.record({
      provider: 'whatchimp',
      method: request.method,
      url: request.url,
      queryParams: Object.fromEntries(url.searchParams),
      headers: maskHeaders(request),
      contentType,
      bodyFormat,
      rawBody: truncated ? rawBody.slice(0, MAX_RAW_BODY_CHARS) : rawBody,
      rawBodyTruncated: truncated,
      parsedBody,
      remoteIp:
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        request.headers.get('x-real-ip'),
    });
    console.info(`[whatchimp inspect] captured ${request.method} as webhookInspections/${inspectionId}`);
  } catch (error) {
    // Never surface a failure: a 4xx/5xx here could make WhatChimp
    // disable the webhook or retry-storm it, and losing one capture is
    // recoverable by sending another message.
    console.error('[whatchimp inspect] failed to record inbound request', error);
  }

  return new Response(null, { status: 200 });
}

export async function POST(request: Request): Promise<Response> {
  return capture(request);
}

/** Some providers probe a webhook URL with a GET before enabling it — captured too, and answered 200 either way. */
export async function GET(request: Request): Promise<Response> {
  return capture(request);
}
