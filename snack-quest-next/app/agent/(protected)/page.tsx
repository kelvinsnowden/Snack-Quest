import type { Metadata } from 'next';
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { conversationService } from '@/services/conversationService';
import { userRepository } from '@/repositories/userRepository';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ConversationStatusBadge } from '@/components/admin/ConversationStatusBadge';
import { formatDateTime } from '@/lib/orders/format';
import type { Conversation } from '@/types';

export const metadata: Metadata = { title: 'My queue' };

function ConversationTable({
  rows,
  agentNameById,
  currentAgentId,
  emptyLabel,
}: {
  rows: { id: string; data: Conversation }[];
  agentNameById: Map<string, string>;
  currentAgentId: string;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <EmptyState icon={Inbox} title={emptyLabel} description="Check back once a customer needs a hand." />;
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
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
            {rows.map(({ id, data }) => (
              <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                <td className="px-4 py-3">
                  <Link href={`/agent/conversations/${id}`} className="block">
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
                <td className="px-4 py-3 text-foreground">
                  {!data.assignedAgentId
                    ? 'Unclaimed'
                    : data.assignedAgentId === currentAgentId
                      ? 'You'
                      : (agentNameById.get(data.assignedAgentId) ?? '—')}
                </td>
                <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDateTime(data.lastMessageAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default async function AgentQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ queueCursor?: string; mineCursor?: string }>;
}) {
  const session = await requireStaffSession();
  const { queueCursor, mineCursor } = await searchParams;

  const [queue, mine] = await Promise.all([
    conversationService.listConversations(session.businessId, { status: 'agent_assigned', cursor: queueCursor }),
    conversationService.listMyConversations(session.businessId, session.uid, { cursor: mineCursor }),
  ]);

  const otherAgentIds = Array.from(
    new Set(
      queue.conversations
        .map(({ data }) => data.assignedAgentId)
        .filter((id): id is string => Boolean(id) && id !== session.uid),
    ),
  );
  const otherAgents = await Promise.all(otherAgentIds.map((id) => userRepository.findById(id)));
  const agentNameById = new Map(otherAgentIds.map((id, index) => [id, otherAgents[index]?.displayName ?? id]));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">My queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">Conversations escalated to a human, and the ones you&apos;re already working.</p>
      </div>

      <section className="flex flex-col gap-3">
        <CardHeaderless title="Needs an agent" count={queue.conversations.length} />
        <ConversationTable
          rows={queue.conversations}
          agentNameById={agentNameById}
          currentAgentId={session.uid}
          emptyLabel="Nothing waiting on a human right now"
        />
        {queue.nextCursor ? (
          <div className="flex justify-center">
            <Button asChild variant="outline">
              <Link href={`/agent?queueCursor=${queue.nextCursor}${mineCursor ? `&mineCursor=${mineCursor}` : ''}`}>
                Load more
              </Link>
            </Button>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <CardHeaderless title="My conversations" count={mine.conversations.length} />
        <ConversationTable
          rows={mine.conversations}
          agentNameById={agentNameById}
          currentAgentId={session.uid}
          emptyLabel="You haven't claimed any conversations yet"
        />
        {mine.nextCursor ? (
          <div className="flex justify-center">
            <Button asChild variant="outline">
              <Link href={`/agent?mineCursor=${mine.nextCursor}${queueCursor ? `&queueCursor=${queueCursor}` : ''}`}>
                Load more
              </Link>
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function CardHeaderless({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <span className="rounded-full bg-border/40 px-2 py-0.5 text-caption text-muted-foreground">{count}</span>
    </div>
  );
}
