'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function MarketingSpendForm({
  month,
  initialAmountKes,
  initialMetaSpendKes,
  initialTiktokSpendKes,
}: {
  month: string;
  initialAmountKes: number | null;
  initialMetaSpendKes?: number | null;
  initialTiktokSpendKes?: number | null;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(initialAmountKes !== null ? String(initialAmountKes) : '');
  const [metaSpend, setMetaSpend] = useState(
    initialMetaSpendKes !== null && initialMetaSpendKes !== undefined ? String(initialMetaSpendKes) : '',
  );
  const [tiktokSpend, setTiktokSpend] = useState(
    initialTiktokSpendKes !== null && initialTiktokSpendKes !== undefined ? String(initialTiktokSpendKes) : '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const amountKes = Number(amount);
    if (!Number.isFinite(amountKes) || amountKes < 0) {
      setError('Enter a non-negative number.');
      return;
    }
    const metaSpendKes = metaSpend.trim() ? Number(metaSpend) : undefined;
    if (metaSpendKes !== undefined && (!Number.isFinite(metaSpendKes) || metaSpendKes < 0)) {
      setError('Meta spend must be a non-negative number.');
      return;
    }
    const tiktokSpendKes = tiktokSpend.trim() ? Number(tiktokSpend) : undefined;
    if (tiktokSpendKes !== undefined && (!Number.isFinite(tiktokSpendKes) || tiktokSpendKes < 0)) {
      setError('TikTok spend must be a non-negative number.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/analytics/marketing-spend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ month, amountKes, metaSpendKes, tiktokSpendKes }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not save this spend figure.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this spend figure.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="marketing-spend">Total marketing spend this month (KES)</Label>
        <Input
          id="marketing-spend"
          type="number"
          min={0}
          step={1}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0"
          aria-invalid={Boolean(error) || undefined}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meta-spend">Of which, Meta ads (KES)</Label>
          <Input
            id="meta-spend"
            type="number"
            min={0}
            step={1}
            value={metaSpend}
            onChange={(event) => setMetaSpend(event.target.value)}
            placeholder="Optional"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tiktok-spend">Of which, TikTok ads (KES)</Label>
          <Input
            id="tiktok-spend"
            type="number"
            min={0}
            step={1}
            value={tiktokSpend}
            onChange={(event) => setTiktokSpend(event.target.value)}
            placeholder="Optional"
          />
        </div>
      </div>
      <p className="text-caption text-muted-foreground">
        The channel figures are optional and don&apos;t need to add up to the total — fill them in to see CAC per
        platform below.
      </p>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <Button size="md" onClick={save} loading={submitting} className="w-fit">
        Save
      </Button>
    </div>
  );
}
