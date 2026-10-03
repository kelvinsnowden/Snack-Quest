'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface CardSubscription {
  id: string;
  planName: string;
  amountKes: number;
  frequency: 'weekly' | 'monthly';
  status: 'active' | 'paused' | 'cancelled' | 'in_arrears';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  lastPaymentStatus: 'paid' | 'unpaid' | 'waived';
  lastPaidAt: string | null;
  arrearsKes: number;
  graceUntil: string | null;
}

type Result = { ok: boolean; text: string } | null;
const day = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric' });
const STATUS: Record<CardSubscription['status'], string> = { active: 'Active', paused: 'Paused', cancelled: 'Cancelled', in_arrears: 'In arrears' };

async function send(url: string, method: 'POST' | 'PATCH', body: Record<string, unknown>): Promise<void> {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
  if (!response.ok) throw new Error(data?.message ?? data?.error ?? `Couldn't save (HTTP ${response.status}).`);
}

/**
 * The owner's subscription on this machine: what it costs, where the
 * current period stands, and what's owed. Payments are recorded by
 * staff — nothing here charges anyone. The subscription is taken off
 * the owner's settlements.
 */
export function SubscriptionCard({ machineId, ownerId, ownerName, subscription, canManage }: { machineId: string; ownerId: string | null; ownerName: string | null; subscription: CardSubscription | null; canManage: boolean }) {
  const router = useRouter();
  const [planName, setPlanName] = useState('Standard');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<'monthly' | 'weekly'>('monthly');
  const [start, setStart] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function run(work: () => Promise<void>, success: string) {
    setBusy(true);
    setResult(null);
    try {
      await work();
      setResult({ ok: true, text: success });
      setConfirming(null);
      router.refresh();
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : "Couldn't save." });
    } finally {
      setBusy(false);
    }
  }

  const act = (action: string, success: string) => run(() => send(`/api/vending/machines/${machineId}/subscription/${subscription!.id}`, 'PATCH', { action }), success);
  const message = result ? (
    <p role={result.ok ? 'status' : 'alert'} className={`flex items-start gap-2 text-sm ${result.ok ? 'text-success' : 'text-danger'}`}>
      {result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
      {result.text}
    </p>
  ) : null;

  if (!ownerId) return <p className="text-sm text-muted-foreground">Snack Quest owns this machine, so there’s no owner subscription.</p>;

  if (!subscription) {
    if (!canManage) return <p className="text-sm text-muted-foreground">No subscription for {ownerName}.</p>;
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">No subscription yet. Set one up for {ownerName}:</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="sub-plan">Plan name</Label>
            <Input id="sub-plan" value={planName} onChange={(event) => setPlanName(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="sub-amount">Amount (KES)</Label>
            <Input id="sub-amount" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="sub-frequency">Every</Label>
            <select id="sub-frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as 'monthly' | 'weekly')} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
              <option value="monthly">30 days</option>
              <option value="weekly">7 days</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="sub-start">Starts (optional, today if blank)</Label>
            <Input id="sub-start" type="date" value={start} onChange={(event) => setStart(event.target.value)} />
          </div>
        </div>
        {message}
        <div>
          <Button
            size="sm"
            loading={busy}
            disabled={busy || !planName.trim() || !/^\d+$/.test(amount.trim()) || Number(amount) <= 0}
            onClick={() => run(() => send(`/api/vending/machines/${machineId}/subscription`, 'POST', { partnerId: ownerId, planName: planName.trim(), amountKes: Number(amount), frequency, startDate: start ? new Date(`${start}T00:00:00+03:00`).toISOString() : undefined }), 'Subscription set up.')}
          >
            Set up subscription
          </Button>
        </div>
      </div>
    );
  }

  const s = subscription;
  const open = s.status !== 'cancelled';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{s.planName}</span>
        <span className="tabular-nums text-muted-foreground">KES {s.amountKes.toLocaleString('en-KE')} every {s.frequency === 'monthly' ? '30' : '7'} days</span>
        <Badge variant={s.status === 'active' ? 'success' : s.status === 'in_arrears' ? 'danger' : 'outline'}>{STATUS[s.status]}</Badge>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">This period</dt>
        <dd className="text-foreground">{day.format(new Date(s.currentPeriodStart))} – {day.format(new Date(s.currentPeriodEnd))} · {s.lastPaymentStatus === 'unpaid' ? 'not paid yet' : s.lastPaymentStatus}</dd>
        <dt className="text-muted-foreground">Last payment</dt>
        <dd className="text-foreground">{s.lastPaidAt ? day.format(new Date(s.lastPaidAt)) : 'none recorded'}</dd>
        <dt className="text-muted-foreground">Arrears</dt>
        <dd className={s.arrearsKes > 0 ? 'font-medium text-danger' : 'text-foreground'}>KES {s.arrearsKes.toLocaleString('en-KE')}{s.graceUntil && s.arrearsKes === 0 && s.lastPaymentStatus === 'unpaid' ? ` · grace until ${day.format(new Date(s.graceUntil))}` : ''}</dd>
      </dl>
      {message}
      {canManage && open ? (
        confirming ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <p className="text-sm text-foreground">
              {confirming === 'recordPayment'
                ? `Record that ${s.amountKes.toLocaleString('en-KE')} was paid for this period and move to the next.${s.arrearsKes > 0 ? ` This also clears the KES ${s.arrearsKes.toLocaleString('en-KE')} of arrears.` : ''}`
                : confirming === 'waivePeriod'
                  ? `Let this period go unpaid and move to the next.${s.arrearsKes > 0 ? ` This also clears the KES ${s.arrearsKes.toLocaleString('en-KE')} of arrears.` : ''}`
                  : 'Cancel this subscription for good? Future settlements won’t take it off.'}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant={confirming === 'cancel' ? 'danger' : 'primary'} loading={busy} onClick={() => act(confirming, confirming === 'recordPayment' ? 'Payment recorded.' : confirming === 'waivePeriod' ? 'Period waived.' : 'Subscription cancelled.')}>
                {confirming === 'recordPayment' ? 'Record payment' : confirming === 'waivePeriod' ? 'Waive period' : 'Cancel subscription'}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(null)}>Back</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => setConfirming('recordPayment')}>Record payment…</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming('waivePeriod')}>Waive period…</Button>
            {s.status === 'paused' ? (
              <Button size="sm" variant="outline" loading={busy} onClick={() => act('resume', 'Resumed.')}>Resume</Button>
            ) : s.status === 'active' ? (
              <Button size="sm" variant="outline" loading={busy} onClick={() => act('pause', 'Paused.')}>Pause</Button>
            ) : null}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming('cancel')}>Cancel…</Button>
          </div>
        )
      ) : null}
    </div>
  );
}
