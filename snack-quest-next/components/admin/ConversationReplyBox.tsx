'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function ConversationReplyBox({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/conversations/${conversationId}/reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not send this message.');
      }
      setText('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send this message.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Reply to the customer on WhatsApp..."
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void send();
          }
        }}
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex justify-end">
        <Button size="sm" onClick={send} loading={submitting} disabled={!text.trim()}>
          <Send aria-hidden="true" />
          Send
        </Button>
      </div>
    </div>
  );
}
