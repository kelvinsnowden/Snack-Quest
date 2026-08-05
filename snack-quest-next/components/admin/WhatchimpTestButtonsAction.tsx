'use client';

import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Sends one real interactive-buttons WhatsApp message (§ WhatChimp
 * Integration Redesign — outbound verification). Deliberately separate
 * from "Test connection", which is side-effect-free: this one costs a
 * real message, so it is visually distinct, states that plainly, and
 * only appears on the WhatChimp card.
 *
 * It exists because `sendButtons` is the one outbound path a read-only
 * call cannot prove, and because the button `id`s it sets are what
 * arrive back on the inbound webhook — the payload shape the
 * conversation engine needs in order to route replies.
 */
export function WhatchimpTestButtonsAction({ disabled }: { disabled: boolean }) {
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error: string | null } | null>(null);

  async function onSend() {
    setSending(true);
    setResult(null);
    try {
      const response = await fetch('/api/admin/whatchimp/send-test-buttons', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const body = (await response.json()) as { success?: boolean; error?: string | null };
      setResult({ success: Boolean(body.success), error: body.error ?? null });
    } catch {
      setResult({ success: false, error: 'Could not reach the server to send this test.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <Label htmlFor="whatchimp-test-phone">Send test buttons</Label>
      <p className="text-caption text-muted-foreground">
        Delivers a real WhatsApp message with two tappable buttons. The number must have messaged this business within
        the last 24 hours — WhatsApp only allows interactive messages inside that window.
      </p>
      <div className="flex gap-2">
        <Input
          id="whatchimp-test-phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="254712345678"
          inputMode="numeric"
          disabled={disabled || sending}
        />
        <Button size="sm" variant="outline" onClick={onSend} disabled={disabled || sending || !phone.trim()}>
          {sending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-4" aria-hidden="true" />
          )}
          Send
        </Button>
      </div>
      {result ? (
        <p className={`text-sm ${result.success ? 'text-success' : 'text-danger'}`}>
          {result.success ? 'Sent — check the phone and tap a button.' : (result.error ?? 'Could not send.')}
        </p>
      ) : null}
    </div>
  );
}
