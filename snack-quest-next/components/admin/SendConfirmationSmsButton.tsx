'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Sends the order confirmation text for an order recorded by hand
 * (§ manual confirmation SMS).
 *
 * Those orders deliberately do not text automatically — staff place
 * them while still with the customer, so the text goes out when they
 * say so. This is that button.
 *
 * Once a text has gone out it says so and stops offering to send
 * again, rather than presenting a control that would silently do
 * nothing: the send is deduped on the order, so a second press could
 * never reach the customer anyway.
 */
export function SendConfirmationSmsButton({
  orderId,
  alreadySent,
  phoneNumber,
}: {
  orderId: string;
  alreadySent: boolean;
  phoneNumber: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(alreadySent);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/send-confirmation-sms`, {
        method: 'POST',
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? `The text could not be sent (HTTP ${response.status}).`);
      }
      setSent(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The text could not be sent.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p className="text-muted-foreground mt-3 flex items-center gap-2 text-sm">
        <Check className="text-success size-4 shrink-0" aria-hidden="true" />
        Confirmation text sent to {phoneNumber}.
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <Button variant="outline" size="sm" onClick={send} loading={busy} className="self-start">
        <MessageSquare className="size-4" aria-hidden="true" />
        Text the customer their confirmation
      </Button>
      <p className="text-muted-foreground text-caption">
        Order reference, total and how it was paid — sent to {phoneNumber}.
      </p>
      {error ? (
        <p className="text-danger flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
