import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { whatchimpGateway } from '@/lib/integrations/whatchimp/whatchimpGateway';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * Sends one real WhatsApp message to a staff-supplied number, via
 * either outbound path (§ WhatChimp Integration Redesign — outbound
 * verification).
 *
 * Unlike "Test connection", which is deliberately side-effect-free,
 * this **does deliver a real message**. That is the point: neither
 * send path can be proven by a read-only call, and the two hit
 * *different* WhatChimp endpoints —
 *
 *   kind: 'text'    -> POST /whatsapp/send
 *   kind: 'buttons' -> POST /whatsapp/send/interactive-buttons
 *
 * — which is what makes this diagnostic rather than cosmetic. An
 * account can be provisioned for one and not the other, so "does
 * plain text work?" and "do interactive messages work?" are genuinely
 * separate questions; answering them separately is how an "account
 * not found" failure gets narrowed down to a capability rather than a
 * credential.
 *
 * `kind: 'buttons'` also produces the button-reply payload the inbound
 * webhook capture still needs: the `id`s below are what come back when
 * the customer taps, and what the conversation engine will route on.
 *
 * Super-admin only, audit-logged. WhatsApp only accepts either message
 * type inside the 24-hour customer-initiated window, so the target
 * must have messaged the business first — WhatChimp's own error is
 * surfaced verbatim, which states that clearly enough to act on.
 */

const TEST_BUTTONS = [
  { id: 'door', title: 'Door Delivery' },
  { id: 'pickup', title: 'Pickup Station' },
];

const TEST_BODY_TEXT = 'Snack Quest test — how would you like your box delivered?';
const TEST_TEXT = 'Snack Quest test message. If you can read this, outbound messaging works.';

type TestKind = 'text' | 'buttons';

const ENDPOINT_FOR_KIND: Record<TestKind, string> = {
  text: '/whatsapp/send',
  buttons: '/whatsapp/send/interactive-buttons',
};

export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { phone, kind } = (body ?? {}) as { phone?: unknown; kind?: unknown };
  if (typeof phone !== 'string' || phone.replace(/\D/g, '').length < 9) {
    return Response.json(
      { error: 'Enter the recipient\'s WhatsApp number including its country code, e.g. 254712345678.' },
      { status: 400 },
    );
  }
  if (kind !== 'text' && kind !== 'buttons') {
    return Response.json({ error: '"kind" must be "text" or "buttons".' }, { status: 400 });
  }

  try {
    const result =
      kind === 'text'
        ? await whatchimpGateway.sendMessage({
            businessId: session.businessId,
            phone,
            text: TEST_TEXT,
          })
        : await whatchimpGateway.sendButtons({
            businessId: session.businessId,
            phone,
            bodyText: TEST_BODY_TEXT,
            buttons: TEST_BUTTONS,
          });

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'integration.send_test_message',
      entityType: 'integrationSecret',
      entityId: 'whatchimp',
      after: { phone, kind, providerMessageId: result.providerMessageId },
    });

    return Response.json({
      success: true,
      kind,
      endpoint: ENDPOINT_FOR_KIND[kind],
      providerMessageId: result.providerMessageId,
      error: null,
    });
  } catch (error) {
    // Surfaced rather than thrown: WhatChimp's own message (a closed
    // 24-hour window, an unrecognised phone number id, a bad
    // credential) is the actually-useful diagnostic, and which
    // endpoint produced it is half the diagnosis.
    return Response.json({
      success: false,
      kind,
      endpoint: ENDPOINT_FOR_KIND[kind],
      providerMessageId: null,
      error: error instanceof Error ? error.message : 'unknown error',
    });
  }
}
