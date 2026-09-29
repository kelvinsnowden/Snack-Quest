import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  conversationService,
  ConversationNotFoundError,
} from '@/services/conversationService';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/** "Assign to me" (§ Admin: Conversation monitoring — the human agent queue's core action). Always assigns the calling staff member, never an arbitrary id. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'support.conversations.handle')) {
    return forbiddenForPermission('support.conversations.handle');
  }

  const { conversationId } = await params;

  try {
    await conversationService.adminAssignAgent(
      session.businessId,
      conversationId,
      session.uid,
    );
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
            : 'Could not assign conversation',
      },
      { status: 400 },
    );
  }
}
