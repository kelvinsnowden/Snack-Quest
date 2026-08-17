import {
  hasStaffRole,
  ADMIN_OR_AGENT,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  conversationService,
  ConversationNotFoundError,
} from '@/services/conversationService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * A human agent's Bolt quote for a door-delivery order (§ Human Sales
 * Agent workspace). Real staff-authenticated replacement for
 * `/api/internal/conversations/[conversationId]/price-door-delivery` —
 * that route pre-dates staff auth (§ Admin auth foundation) and used a
 * shared-secret header with a caller-supplied, unverified `agentId`;
 * this one takes the agent's identity from their own session, the same
 * pattern as `assign`/`reply`/`return-to-bot`. Sends the customer an
 * itemized quote ending in "reply PAY" — it does NOT trigger an M-Pesa
 * STK push itself, by design (§ ConversationService.confirmAndFreeze):
 * STK only fires once the customer replies PAY, never from a staff
 * action, so a delivery quote is never mistaken for consent to charge.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_OR_AGENT)) {
    return forbiddenResponse();
  }

  const { conversationId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { feeKes } = (body ?? {}) as { feeKes?: unknown };
  if (typeof feeKes !== 'number' || !Number.isFinite(feeKes) || feeKes < 0) {
    return Response.json(
      { error: '"feeKes" must be a non-negative number.' },
      { status: 400 },
    );
  }

  try {
    await conversationService.adminPriceDoorDelivery(
      session.businessId,
      conversationId,
      {
        agentId: session.uid,
        feeKes,
      },
    );
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'conversation.price_door_delivery',
      entityType: 'conversation',
      entityId: conversationId,
      after: { feeKes },
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not price this delivery',
      },
      { status: 400 },
    );
  }
}
