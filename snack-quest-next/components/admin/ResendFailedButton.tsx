'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { MarketingEmailFailedRecipient } from '@/types';

interface ResendFailedButtonProps {
  campaignId: string;
  failedRecipients: MarketingEmailFailedRecipient[];
}

/**
 * The "why did this fail, and let me try again without retyping
 * everything" surface (§ Admin: Marketing Emails) — every recipient a
 * send attempt actually failed for, the real gateway error next to
 * each one, and a resend that dials only those addresses with the
 * exact content that already sent successfully to everyone else.
 */
export function ResendFailedButton({ campaignId, failedRecipients }: ResendFailedButtonProps) {
  const router = useRouter();
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sentCount: number; failedCount: number } | null>(null);

  async function onResend() {
    setResending(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/admin/marketing-emails/${campaignId}/resend`, { method: 'POST' });
      const body = (await response.json().catch(() => null)) as
        | { sentCount: number; failedCount: number; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? 'Could not resend to the failed recipients.');
      }
      setResult(body);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend to the failed recipients.');
    } finally {
      setResending(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-foreground">
              {failedRecipients.length} recipient{failedRecipients.length === 1 ? '' : 's'} failed
            </p>
            <p className="text-xs text-muted-foreground">
              The real error from each attempt is below. Resending only retries these addresses, with the same content that
              already went out — nothing to recompose.
            </p>
          </div>
        </div>

        <ul className="flex flex-col gap-2 rounded-lg border border-border bg-border/10 p-3">
          {failedRecipients.map((recipient) => (
            <li key={recipient.email} className="flex flex-col gap-0.5 text-sm">
              <span className="font-medium text-foreground">{recipient.email}</span>
              <span className="text-xs text-danger">{recipient.error}</span>
            </li>
          ))}
        </ul>

        {result ? (
          <p className="text-sm text-foreground">
            Resent: {result.sentCount} succeeded{result.failedCount > 0 ? `, ${result.failedCount} still failed` : ''}.
          </p>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <Button type="button" onClick={onResend} loading={resending} className="self-start">
          <RefreshCw className="size-4" aria-hidden="true" />
          Resend to failed recipients
        </Button>
      </CardContent>
    </Card>
  );
}
