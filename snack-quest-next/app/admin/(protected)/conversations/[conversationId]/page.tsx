import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { conversationService, ConversationNotFoundError } from '@/services/conversationService';
import { conversationRepository } from '@/repositories/conversationRepository';
import { userRepository } from '@/repositories/userRepository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConversationStatusBadge } from '@/components/admin/ConversationStatusBadge';
import { ConversationAgentActions } from '@/components/admin/ConversationAgentActions';
import { ConversationReplyBox } from '@/components/admin/ConversationReplyBox';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Conversation' };

export default async function AdminConversationDetailPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const session = await requireStaffSession();
  const { conversationId } = await params;

  let conversation;
  try {
    conversation = await conversationService.getConversation(session.businessId, conversationId);
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      notFound();
    }
    throw error;
  }

  const [messages, assignedAgent] = await Promise.all([
    conversationRepository.listMessages(conversationId),
    conversation.assignedAgentId ? userRepository.findById(conversation.assignedAgentId) : null,
  ]);

  const { stateBlob } = conversation;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/admin/conversations"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Conversations
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-page-title font-bold tracking-tight text-foreground tabular-nums">{conversation.phoneNumber}</h1>
            <ConversationStatusBadge status={conversation.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {stateBlob.customerName ?? 'No name yet'}
            {assignedAgent ? ` · Assigned to ${assignedAgent.displayName}` : ''}
          </p>
        </div>
        <ConversationAgentActions
          conversationId={conversationId}
          status={conversation.status}
          isAssignedToMe={conversation.assignedAgentId === session.uid}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="flex flex-col lg:col-span-2">
          <CardHeader>
            <CardTitle>Transcript</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            <div className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No messages yet.</p>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={index}
                    className={cn('flex flex-col gap-1', message.direction === 'outbound' ? 'items-end' : 'items-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap',
                        message.direction === 'outbound'
                          ? 'bg-primary/10 text-foreground'
                          : 'bg-border/30 text-foreground',
                      )}
                    >
                      {message.body}
                    </div>
                    <span className="text-caption text-muted-foreground tabular-nums">{formatDateTime(message.sentAt)}</span>
                  </div>
                ))
              )}
            </div>
            <div className="mt-2 border-t border-border pt-3">
              <ConversationReplyBox conversationId={conversationId} />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Selections</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
                <span className="text-muted-foreground">Box</span>
                <span className="font-medium text-foreground">{stateBlob.packageLabel ?? '—'}</span>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
                <span className="text-muted-foreground">County</span>
                <span className="font-medium text-foreground">{stateBlob.county ?? '—'}</span>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
                <span className="text-muted-foreground">Delivery</span>
                <span className="font-medium text-foreground capitalize">{stateBlob.deliveryMethod ?? '—'}</span>
              </div>
              {conversation.escalationReason ? (
                <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
                  <span className="text-muted-foreground">Escalation reason</span>
                  <span className="font-medium text-foreground capitalize">{conversation.escalationReason.replace(/_/g, ' ')}</span>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
