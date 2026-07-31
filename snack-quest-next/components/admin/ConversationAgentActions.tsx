'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { ConversationStatus } from '@/types';

export function ConversationAgentActions({
  conversationId,
  status,
  isAssignedToMe,
}: {
  conversationId: string;
  status: ConversationStatus;
  isAssignedToMe: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<'assign' | 'return' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(action: 'assign' | 'return-to-bot', kind: 'assign' | 'return') {
    setPending(kind);
    setError(null);
    try {
      const response = await fetch(`/api/admin/conversations/${conversationId}/${action}`, { method: 'POST' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not update this conversation.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this conversation.');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {!isAssignedToMe ? (
          <Button size="sm" loading={pending === 'assign'} onClick={() => call('assign', 'assign')}>
            Assign to me
          </Button>
        ) : null}
        {status === 'agent_assigned' ? (
          <Button size="sm" variant="outline" loading={pending === 'return'} onClick={() => call('return-to-bot', 'return')}>
            Return to bot
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
