import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { conversationService, ConversationNotFoundError } from '@/services/conversationService';

/** A staff member's message to the customer (§ Admin: Conversation monitoring), sent through the real WhatsApp gateway and appended to the transcript exactly like a bot reply. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { conversationId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { text } = (body ?? {}) as { text?: unknown };
  if (typeof text !== 'string' || text.trim().length === 0) {
    return Response.json({ error: '"text" is required.' }, { status: 400 });
  }

  try {
    await conversationService.sendAgentReply(session.businessId, conversationId, text.trim());
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not send message' },
      { status: 400 },
    );
  }
}
