'use client';

import { useState } from 'react';
import { Loader2, MessageSquare, MousePointerClick } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type TestKind = 'text' | 'buttons';

interface TestResult {
  success: boolean;
  kind: TestKind;
  endpoint: string | null;
  error: string | null;
}

/**
 * Sends a real WhatsApp message down either outbound path (§ WhatChimp
 * Integration Redesign — outbound verification). Deliberately separate
 * from "Test connection", which is side-effect-free: these cost a real
 * message, so they are visually distinct, say so plainly, and only
 * appear on the WhatChimp card.
 *
 * Two buttons rather than one because the two send paths hit different
 * WhatChimp endpoints and an account can be provisioned for one and
 * not the other — so which one fails is itself the diagnosis. The
 * endpoint that produced the result is shown alongside it for exactly
 * that reason.
 */
export function WhatchimpTestMessageAction({ disabled }: { disabled: boolean }) {
  const [phone, setPhone] = useState('');
  const [pending, setPending] = useState<TestKind | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);

  async function send(kind: TestKind) {
    setPending(kind);
    setResult(null);
    try {
      const response = await fetch('/api/admin/whatchimp/send-test-message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, kind }),
      });
      const body = (await response.json()) as Partial<TestResult>;
      setResult({
        success: Boolean(body.success),
        kind,
        endpoint: body.endpoint ?? null,
        error: body.error ?? null,
      });
    } catch {
      setResult({ success: false, kind, endpoint: null, error: 'Could not reach the server to send this test.' });
    } finally {
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <Label htmlFor="whatchimp-test-phone">Send a test message</Label>
      <p className="text-caption text-muted-foreground">
        Delivers a real WhatsApp message. The number must have messaged this business within the last 24 hours —
        WhatsApp only allows these inside that window. Plain text and buttons use different WhatChimp endpoints, so
        trying both narrows down where a failure actually is.
      </p>
      <Input
        id="whatchimp-test-phone"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        placeholder="254712345678"
        inputMode="numeric"
        disabled={disabled || busy}
      />
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => send('text')} disabled={disabled || busy || !phone.trim()}>
          {pending === 'text' ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <MessageSquare className="size-4" aria-hidden="true" />
          )}
          Send text
        </Button>
        <Button size="sm" variant="outline" onClick={() => send('buttons')} disabled={disabled || busy || !phone.trim()}>
          {pending === 'buttons' ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <MousePointerClick className="size-4" aria-hidden="true" />
          )}
          Send buttons
        </Button>
      </div>
      {result ? (
        <div className={`text-sm ${result.success ? 'text-success' : 'text-danger'}`}>
          <p>
            {result.success
              ? result.kind === 'buttons'
                ? 'Sent — check the phone and tap a button.'
                : 'Sent — check the phone.'
              : (result.error ?? 'Could not send.')}
          </p>
          {result.endpoint ? <p className="mt-0.5 text-caption text-muted-foreground">via {result.endpoint}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
