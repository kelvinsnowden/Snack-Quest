import { conversationService } from '@/services/conversationService';

/**
 * The one real wire a human agent has today for the Nairobi
 * door-delivery hand-off (§ redesign: multiple delivery methods): the
 * agent has confirmed the address with the customer and knows the
 * Bolt fee (checked on the Bolt app — nothing in this codebase calls
 * Bolt's API, because there is no such integration to call), and
 * calls this route to price the order. It does NOT trigger the M-Pesa
 * STK push (§ redesign: customer-controlled STK push) — pricing only
 * sends the customer a quotation and waits for them to reply PAY;
 * `ConversationService.priceDoorDelivery()` owns the actual business
 * logic; this route is just the wire, same pattern as the
 * Daraja/Whatchimp webhook routes.
 *
 * Honest gap, not a silently-assumed one: this codebase has no staff
 * authentication (no login, no per-agent identity, no `staffProfiles`
 * repository — see PLATFORM_ARCHITECTURE_V2.md §21). A shared-secret
 * header is a stopgap so this endpoint isn't wide open, not a
 * replacement for real staff auth — building that (accounts, roles,
 * sessions) is separate, larger scope. `agentId` is caller-supplied
 * and unverified for the same reason; it's recorded for the audit
 * trail, not trusted as proof of who priced the order.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
): Promise<Response> {
  const expectedKey = process.env.INTERNAL_AGENT_API_KEY;
  const providedKey = request.headers.get('x-internal-api-key');
  if (!expectedKey || !providedKey || providedKey !== expectedKey) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { conversationId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { agentId, feeKes } = (body ?? {}) as { agentId?: unknown; feeKes?: unknown };
  if (typeof agentId !== 'string' || !agentId || typeof feeKes !== 'number') {
    return Response.json(
      { error: 'body must include a non-empty string agentId and a numeric feeKes' },
      { status: 400 },
    );
  }

  try {
    await conversationService.priceDoorDelivery(conversationId, { agentId, feeKes });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'unknown error' },
      { status: 400 },
    );
  }
}
