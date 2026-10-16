'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BellOff, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function StopLeadEmails({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');

  async function confirm() {
    setState('saving');
    try {
      const response = await fetch('/api/leads/stop-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      setState(response.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="bg-success/10 text-success flex size-14 items-center justify-center rounded-full">
          <CheckCircle2 className="size-7" aria-hidden="true" />
        </span>
        <h1 className="text-foreground text-2xl font-bold tracking-tight sm:text-3xl">Done</h1>
        <p className="text-muted-foreground max-w-md text-pretty text-base">
          We won&rsquo;t email you about Snack Quest machines again.
        </p>
        <Link href="/" className="text-primary text-sm font-medium underline-offset-4 hover:underline">
          Back to Snack Quest
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <span className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-full">
        <BellOff className="size-7" aria-hidden="true" />
      </span>
      <h1 className="text-foreground text-2xl font-bold tracking-tight sm:text-3xl">Stop these emails?</h1>
      <Button type="button" onClick={confirm} loading={state === 'saving'}>
        Stop emails
      </Button>
      {state === 'error' ? (
        <p role="alert" className="text-danger text-sm">
          That didn&rsquo;t work. Please try again.
        </p>
      ) : null}
    </div>
  );
}
