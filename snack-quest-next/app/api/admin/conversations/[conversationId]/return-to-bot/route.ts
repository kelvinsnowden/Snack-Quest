import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { conversationService, ConversationNotFoundError } from '@/services/conversationService';

/** Hands the conversation back to the bot (§ Admin: Conversation monitoring). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { conversationId } = await params;

  try {
    await conversationService.adminReturnToBot(session.businessId, conversationId);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not return conversation to bot' },
      { status: 400 },
    );
  }
}
