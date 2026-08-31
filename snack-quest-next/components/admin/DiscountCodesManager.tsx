'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { validateDiscountCodeInput } from '@/lib/checkout/discountCode';

/**
 * Creating and retiring discount codes (§ discount codes).
 *
 * The form is arranged around the decision staff are actually making,
 * which is "how much, to how many people, for how long". Everything
 * else on a code is a consequence of those three.
 */

export interface DiscountCodeRow {
  code: string;
  kind: 'percentage' | 'fixed';
  value: number;
  waivesDelivery: boolean;
  maxRedemptions: number | null;
  redemptionCount: number;
  startsAt: number | null;
  expiresAt: number | null;
  isActive: boolean;
  note: string | null;
}

function describeLimit(row: DiscountCodeRow): string {
  if (row.maxRedemptions === null) {
    return `${row.redemptionCount} used · no limit`;
  }
  return `${row.redemptionCount} of ${row.maxRedemptions} used`;
}

function describeWindow(row: DiscountCodeRow): string {
  const fmt = (ms: number) => new Date(ms).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
  if (row.startsAt && row.expiresAt) return `${fmt(row.startsAt)} to ${fmt(row.expiresAt)}`;
  if (row.expiresAt) return `Until ${fmt(row.expiresAt)}`;
  if (row.startsAt) return `From ${fmt(row.startsAt)}`;
  return 'No expiry';
}

/**
 * Whether a code can still be redeemed right now.
 *
 * Computed rather than stored, because "expired" is a fact about the
 * clock and a stored flag would be wrong the moment nobody looked at
 * it. Deliberately mirrors `rejectionFor`, which is what the checkout
 * actually enforces — a screen saying "live" about a code the checkout
 * refuses would be worse than saying nothing.
 */
function statusOf(row: DiscountCodeRow, now = Date.now()): { label: string; tone: string } {
  if (!row.isActive) return { label: 'Off', tone: 'text-muted-foreground' };
  if (row.startsAt && now < row.startsAt) return { label: 'Scheduled', tone: 'text-warning' };
  if (row.expiresAt && now >= row.expiresAt) return { label: 'Expired', tone: 'text-muted-foreground' };
  if (row.maxRedemptions !== null && row.redemptionCount >= row.maxRedemptions) {
    return { label: 'Used up', tone: 'text-muted-foreground' };
  }
  return { label: 'Live', tone: 'text-success' };
}

export function DiscountCodesManager({ initialCodes }: { initialCodes: DiscountCodeRow[] }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'percentage' | 'fixed'>('percentage');
  const [value, setValue] = useState('100');
  const [maxRedemptions, setMaxRedemptions] = useState('1');
  const [expiresAt, setExpiresAt] = useState('');
  const [waivesDelivery, setWaivesDelivery] = useState(true);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const parsedMax = maxRedemptions.trim() === '' ? null : Number(maxRedemptions);
    const problem = validateDiscountCodeInput({
      code,
      kind,
      value: Number(value),
      maxRedemptions: parsedMax,
    });
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/admin/discount-codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code,
          kind,
          value: Number(value),
          maxRedemptions: parsedMax,
          expiresAt: expiresAt || null,
          waivesDelivery,
          note: note || null,
          isActive: true,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? 'Could not create that code.');
        return;
      }
      setCode('');
      setNote('');
      router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(row: DiscountCodeRow) {
    setBusy(true);
    try {
      await fetch('/api/admin/discount-codes', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: row.code, isActive: !row.isActive }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={create} className="border-border flex flex-col gap-4 rounded-lg border p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dc-code">Code</Label>
            <Input
              id="dc-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="PRBOX"
              autoCapitalize="characters"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dc-kind">Discount type</Label>
            <select
              id="dc-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as 'percentage' | 'fixed')}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            >
              <option value="percentage">Percentage off</option>
              <option value="fixed">Fixed KES off</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dc-value">{kind === 'percentage' ? 'Percent off' : 'KES off'}</Label>
            <Input
              id="dc-value"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              inputMode="numeric"
            />
            {kind === 'percentage' && Number(value) === 100 ? (
              <p className="text-muted-foreground text-caption">
                A free box. Nothing is charged and no M-Pesa prompt is sent.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dc-max">Usage limit</Label>
            <Input
              id="dc-max"
              value={maxRedemptions}
              onChange={(event) => setMaxRedemptions(event.target.value)}
              inputMode="numeric"
              placeholder="Blank for unlimited"
            />
            <p className="text-muted-foreground text-caption">Across everyone, not per customer.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dc-expires">Expires</Label>
            <Input
              id="dc-expires"
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
            <p className="text-muted-foreground text-caption">Blank never expires.</p>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="dc-note">What it&rsquo;s for</Label>
            <Input
              id="dc-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Influencer PR — @handle"
            />
          </div>

          <label className="flex items-start gap-2 self-end pb-1">
            <input
              type="checkbox"
              checked={waivesDelivery}
              onChange={(event) => setWaivesDelivery(event.target.checked)}
              className="mt-1 size-4 shrink-0"
            />
            <span className="text-sm">
              Delivery free too
              {/*
                Spelled out because a 100% code alone does not make a
                free order: the box becomes free and the customer still
                pays to have it delivered.
              */}
              <span className="text-muted-foreground block text-caption">
                Otherwise the box is free but delivery is still charged.
              </span>
            </span>
          </label>
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <div>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Create code'}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-3">
        {initialCodes.length === 0 ? (
          <p className="text-muted-foreground text-sm">No discount codes yet.</p>
        ) : (
          initialCodes.map((row) => {
            const status = statusOf(row);
            return (
              <div
                key={row.code}
                className="border-border flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="font-mono">{row.code}</span>
                    <span className={`text-sm ${status.tone}`}>{status.label}</span>
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {row.kind === 'percentage' ? `${row.value}% off` : `KES ${row.value} off`}
                    {row.waivesDelivery ? ' · free delivery' : ''} · {describeLimit(row)} ·{' '}
                    {describeWindow(row)}
                  </p>
                  {row.note ? <p className="text-muted-foreground text-sm">{row.note}</p> : null}
                </div>
                <Button variant="outline" onClick={() => toggle(row)} disabled={busy}>
                  {row.isActive ? 'Turn off' : 'Turn on'}
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
