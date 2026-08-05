import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { whatchimpGateway } from '@/lib/integrations/whatchimp/whatchimpGateway';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * Sends one real interactive-buttons message to a staff-supplied
 * number (§ WhatChimp Integration Redesign — outbound verification).
 *
 * Unlike "Test Connection", which is deliberately side-effect-free,
 * this **does deliver a real WhatsApp message** — that is the whole
 * point: `sendButtons` is the one outbound path that cannot be proven
 * by a read-only call, and the button `id`s it sets are what come back
 * on the inbound webhook, which is how the conversation engine will
 * route replies. Super-admin only, audit-logged, and the UI says
 * plainly that a real message goes out.
 *
 * WhatsApp only accepts interactive buttons inside the 24-hour
 * customer-initiated session window, so the target number must have
 * messaged the business first — the error surfaced on failure is
 * WhatChimp's own, which states this clearly enough to diagnose.
 */

const TEST_BUTTONS = [
  { id: 'door', title: 'Door Delivery' },
  { id: 'pickup', title: 'Pickup Station' },
];

const TEST_BODY_TEXT = 'Snack Quest test — how would you like your box delivered?';

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

  const { phone } = (body ?? {}) as { phone?: unknown };
  if (typeof phone !== 'string' || phone.replace(/\D/g, '').length < 9) {
    return Response.json(
      { error: 'Enter the recipient\'s WhatsApp number including its country code, e.g. 254712345678.' },
      { status: 400 },
    );
  }

  try {
    const result = await whatchimpGateway.sendButtons({
      businessId: session.businessId,
      phone,
      bodyText: TEST_BODY_TEXT,
      buttons: TEST_BUTTONS,
    });

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'integration.send_test_buttons',
      entityType: 'integrationSecret',
      entityId: 'whatchimp',
      after: { phone, providerMessageId: result.providerMessageId },
    });

    return Response.json({ success: true, providerMessageId: result.providerMessageId, error: null });
  } catch (error) {
    // Surfaced to the operator rather than thrown: WhatChimp's own
    // message ("Subscriber limit exceeded", a closed 24-hour window,
    // a bad credential) is the actually-useful diagnostic here.
    return Response.json({
      success: false,
      providerMessageId: null,
      error: error instanceof Error ? error.message : 'unknown error',
    });
  }
}
