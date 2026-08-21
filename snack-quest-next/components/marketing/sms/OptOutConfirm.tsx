'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BellOff, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The confirm step behind an opt-out link (§ marketing SMS opt-out).
 *
 * One button, no form, nothing to fill in. An opt-out that asks for a
 * reason, or an email, or a login is an opt-out designed not to be
 * completed, and this one has to work for someone who is mildly annoyed
 * and holding a phone.
 *
 * It exists at all — rather than the link itself unsubscribing on load
 * — because link scanners fetch URLs unprompted. See the route's own
 * comment.
 */
export function OptOutConfirm({ token, maskedPhone }: { token: string; maskedPhone: string }) {
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setState('saving');
    setError(null);
    try {
      const response = await fetch('/api/sms/opt-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Something went wrong. Please try again.');
        setState('error');
        return;
      }
      setState('done');
    } catch {
      setError('Could not reach us just now. Please try again in a moment.');
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="size-7" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">You&rsquo;re unsubscribed</h1>
        <p className="max-w-md text-pretty text-base text-muted-foreground">
          We won&rsquo;t send marketing texts to {maskedPhone} again. You&rsquo;ll still get messages about orders
          you place — payment confirmations and delivery updates.
        </p>
        <Link href="/" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Back to Snack Quest
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <BellOff className="size-7" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Stop marketing texts?</h1>
        <p className="max-w-md text-pretty text-base text-muted-foreground">
          This stops offers and new-box announcements to {maskedPhone}. You&rsquo;ll still get texts about orders you
          place, like payment confirmations and delivery updates.
        </p>
      </div>

      <Button onClick={confirm} disabled={state === 'saving'} size="lg" className="min-h-12 w-full max-w-xs">
        {state === 'saving' ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Unsubscribing…
          </>
        ) : (
          'Yes, stop marketing texts'
        )}
      </Button>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Link href="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        No thanks, keep them coming
      </Link>
    </div>
  );
}
