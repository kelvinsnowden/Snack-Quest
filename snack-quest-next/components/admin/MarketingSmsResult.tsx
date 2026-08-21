'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RefreshCw, Send } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { calculateSmsCost } from '@/lib/sms/segments';
import type { SerializedMarketingSmsCampaign } from '@/lib/marketingSms/serialize';
import type { MarketingSmsStatus } from '@/types';

const STATUS_VARIANT: Record<MarketingSmsStatus, 'outline' | 'warning' | 'success' | 'danger'> = {
  draft: 'outline',
  sending: 'warning',
  sent: 'success',
  failed: 'danger',
};

/**
 * What a campaign did (§ Admin: Marketing SMS).
 *
 * Shows the exact message that went out and, for a campaign that has
 * sent, the real per-recipient failures with the provider's own error
 * text — the same "why did this fail" answer Marketing Emails gives,
 * which is the difference between a resend that fixes something and one
 * that repeats it.
 */
export function MarketingSmsResult({ campaign }: { campaign: SerializedMarketingSmsCampaign }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cost = calculateSmsCost(campaign.bodyText);
  const isDraft = campaign.status === 'draft';
  const failed = campaign.failedRecipients ?? [];

  async function post(path: string, failureMessage: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(path, { method: 'POST' });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? failureMessage);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : failureMessage);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <Card className="flex items-start gap-3 border-danger/40 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-sm text-foreground">{error}</p>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-card-title font-semibold text-foreground">Message</p>
          <Badge variant={STATUS_VARIANT[campaign.status]}>{campaign.status}</Badge>
        </div>
        <p className="whitespace-pre-wrap rounded-md bg-border/20 p-4 text-sm text-foreground">{campaign.bodyText}</p>
        <p className="text-caption text-muted-foreground">
          Plus each recipient&rsquo;s own opt-out link. Body alone: {cost.characters} characters, {cost.encoding}.
        </p>
      </Card>

      {!isDraft ? (
        <Card className="flex flex-col gap-3 p-5">
          <p className="text-card-title font-semibold text-foreground">Result</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Delivered to provider" value={campaign.sentCount} />
            <Stat label="Failed" value={campaign.failedCount} />
            <Stat label="Skipped (opted out)" value={campaign.optedOutSkippedCount} />
            <Stat label="Segments billed" value={campaign.totalSegmentsSent} />
          </div>
          {campaign.sentAt ? (
            <p className="text-caption text-muted-foreground">Sent {new Date(campaign.sentAt).toLocaleString()}</p>
          ) : null}
        </Card>
      ) : null}

      {failed.length > 0 ? (
        <Card className="flex flex-col gap-3 p-5">
          <p className="text-card-title font-semibold text-foreground">
            Failed recipients ({failed.length})
          </p>
          <ul className="flex flex-col gap-2">
            {failed.map((recipient) => (
              <li
                key={recipient.phoneNumber}
                className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-0 last:pb-0"
              >
                <span className="font-medium tabular-nums text-foreground">{recipient.phoneNumber}</span>
                <span className="text-caption text-muted-foreground">{recipient.error}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {isDraft ? (
          <Button
            onClick={() => post(`/api/admin/marketing-sms/${campaign.id}/send`, 'Could not send this campaign.')}
            loading={busy}
          >
            <Send className="size-4" aria-hidden="true" />
            Send campaign
          </Button>
        ) : null}
        {failed.length > 0 ? (
          <Button
            variant="outline"
            onClick={() => post(`/api/admin/marketing-sms/${campaign.id}/resend`, 'Could not resend to failed recipients.')}
            loading={busy}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Resend to {failed.length} failed
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-caption text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}
