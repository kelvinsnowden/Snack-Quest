import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaffSession } from '@/lib/auth/session';
import { conversationService } from '@/services/conversationService';
import { userRepository } from '@/repositories/userRepository';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyConversationsState } from '@/components/admin/EmptyConversationsState';
import { ConversationStatusBadge } from '@/components/admin/ConversationStatusBadge';
import { CONVERSATION_STATUS_LABELS } from '@/lib/conversation/adminLabels';
import { formatDateTime } from '@/lib/orders/format';
import type { ConversationStatus } from '@/types';

export const metadata: Metadata = { title: 'Conversations' };

const STATUS_FILTERS: ConversationStatus[] = ['agent_assigned', 'active', 'awaiting_payment', 'completed', 'abandoned'];

export default async function AdminConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cursor?: string }>;
}) {
  const session = await requireStaffSession();
  const { status, cursor } = await searchParams;
  const validStatus = STATUS_FILTERS.includes(status as ConversationStatus) ? (status as ConversationStatus) : undefined;

  const { conversations, nextCursor } = await conversationService.listConversations(session.businessId, {
    status: validStatus,
    cursor,
  });

  const agents = await Promise.all(
    conversations.map(({ data }) => (data.assignedAgentId ? userRepository.findById(data.assignedAgentId) : null)),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Conversations</h1>
        <p className="mt-1 text-sm text-muted-foreground">Monitor the WhatsApp checkout and take over threads that need a human.</p>
      </div>

      <Card className="flex flex-wrap gap-2 p-4">
        <Link
          href="/admin/conversations"
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            !status ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/40'
          }`}
        >
          All
        </Link>
        {STATUS_FILTERS.map((value) => (
          <Link
            key={value}
            href={`/admin/conversations?status=${value}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              status === value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/40'
            }`}
          >
            {CONVERSATION_STATUS_LABELS[value]}
          </Link>
        ))}
      </Card>

      {conversations.length === 0 ? (
        <EmptyConversationsState hasFilter={Boolean(status)} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Step</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Agent</th>
                  <th className="px-4 py-3 font-medium">Last message</th>
                </tr>
              </thead>
              <tbody>
                {conversations.map(({ id, data }, index) => (
                  <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                    <td className="px-4 py-3">
                      <Link href={`/admin/conversations/${id}`} className="block">
                        <span className="font-medium text-foreground tabular-nums">{data.phoneNumber}</span>
                        {data.stateBlob.customerName ? (
                          <span className="block text-caption text-muted-foreground">{data.stateBlob.customerName}</span>
                        ) : null}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-foreground capitalize">{data.currentStep.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">
                      <ConversationStatusBadge status={data.status} />
                    </td>
                    <td className="px-4 py-3 text-foreground">{agents[index]?.displayName ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDateTime(data.lastMessageAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link href={`/admin/conversations?${status ? `status=${status}&` : ''}cursor=${nextCursor}`}>Load more</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
