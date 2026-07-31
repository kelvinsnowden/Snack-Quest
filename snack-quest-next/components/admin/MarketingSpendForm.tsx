'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function MarketingSpendForm({ month, initialAmountKes }: { month: string; initialAmountKes: number | null }) {
  const router = useRouter();
  const [amount, setAmount] = useState(initialAmountKes !== null ? String(initialAmountKes) : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const amountKes = Number(amount);
    if (!Number.isFinite(amountKes) || amountKes < 0) {
      setError('Enter a non-negative number.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/analytics/marketing-spend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ month, amountKes }),
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
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="marketing-spend">Marketing spend this month (KES)</Label>
      <div className="flex gap-2">
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
        <Button size="md" onClick={save} loading={submitting}>
          Save
        </Button>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
