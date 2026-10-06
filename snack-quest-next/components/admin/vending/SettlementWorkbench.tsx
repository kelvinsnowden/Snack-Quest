'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface WorkbenchSettlement {
  id: string;
  machineId: string;
  machineCode: string;
  periodStart: string;
  periodEnd: string;
  status: 'draft' | 'finalized' | 'paid';
  grossSalesKes: number;
  refundsKes: number;
  cogsKes: number;
  unpricedSaleCount: number;
  subscriptionChargedKes: number;
  distributableOwnerKes: number;
  adjustmentKes: number;
  adjustmentReason: string | null;
  failedVendRefundsKes: number;
  outcomeConflictCount: number;
  partnerShareKes: number | null;
  finalizedAt: string | null;
}

interface Preview {
  grossSalesKes: number;
  refundsKes: number;
  cogsKes: number;
  unpricedSaleCount: number;
  subscriptionChargedKes: number;
  distributableOwnerKes: number;
  failedVendRefundsKes: number;
  outcomeConflictCount: number;
  partnerShareKes: number | null;
}

type Result = { ok: boolean; text: string } | null;
const kes = (value: number) => `KES ${value.toLocaleString('en-KE')}`;
const dayFormat = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric' });
/** Periods are whole Nairobi days: from 00:00 on the first day to 00:00 after the last. */
const nairobiMidnight = (date: string) => new Date(`${date}T00:00:00+03:00`);
const addDays = (date: string, days: number) => {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};

function lastFullMonth(): { from: string; to: string } {
  const now = new Date(Date.now() + 3 * 3600_000); // Nairobi wall clock
  const firstThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const firstLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { from: firstLastMonth.toISOString().slice(0, 10), to: addDays(firstThisMonth.toISOString().slice(0, 10), -1) };
}

async function send(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) throw new Error((data?.message as string) ?? (data?.error as string) ?? `Couldn't save (HTTP ${response.status}).`);
  return data ?? {};
}

function Breakdown({ figures, adjustmentKes = 0, adjustmentReason = null }: { figures: Preview; adjustmentKes?: number; adjustmentReason?: string | null }) {
  const credited = figures.distributableOwnerKes + adjustmentKes;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-1 tabular-nums">
        <dt className="text-muted-foreground">Sales completed</dt>
        <dd className="text-right text-foreground">{kes(figures.grossSalesKes)}</dd>
        <dt className="text-muted-foreground">− Refunds of those sales</dt>
        <dd className="text-right text-foreground">{kes(figures.refundsKes)}</dd>
        <dt className="text-muted-foreground">− Cost of the snacks sold</dt>
        <dd className="text-right text-foreground">{kes(figures.cogsKes)}</dd>
        <dt className="text-muted-foreground">− Subscription</dt>
        <dd className="text-right text-foreground">{kes(figures.subscriptionChargedKes)}</dd>
        {adjustmentKes !== 0 ? (
          <>
            <dt className="text-muted-foreground">{adjustmentKes > 0 ? '+' : '−'} Adjustment{adjustmentReason ? ` (${adjustmentReason})` : ''}</dt>
            <dd className="text-right text-foreground">{kes(Math.abs(adjustmentKes))}</dd>
          </>
        ) : null}
        <dt className="border-t border-border pt-1 font-semibold text-foreground">Owner is credited</dt>
        <dd className={`border-t border-border pt-1 text-right font-semibold ${credited < 0 ? 'text-danger' : 'text-foreground'}`}>{kes(credited)}</dd>
      </dl>
      {figures.failedVendRefundsKes > 0 ? <p className="text-muted-foreground">Customers refunded for failed vends: {kes(figures.failedVendRefundsKes)}. Those were never sales, so they aren’t taken from the owner.</p> : null}
      {figures.unpricedSaleCount > 0 ? (
        <p className="flex items-start gap-2 text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{figures.unpricedSaleCount} sale(s) have no known cost, so the cost of goods is understated.</p>
      ) : null}
      {figures.outcomeConflictCount > 0 ? (
        <p className="flex items-start gap-2 text-danger"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{figures.outcomeConflictCount} sale(s) have conflicting outcomes. This can’t be finalized until they’re resolved under Sales to review.</p>
      ) : null}
      {credited < 0 ? <p className="text-danger">This settlement would take money from the owner’s balance.</p> : null}
    </div>
  );
}

function DraftActions({ settlement, canManage, canFinalize }: { settlement: WorkbenchSettlement; canManage: boolean; canFinalize: boolean }) {
  const router = useRouter();
  const [adjustment, setAdjustment] = useState(settlement.adjustmentKes ? String(settlement.adjustmentKes) : '');
  const [reason, setReason] = useState(settlement.adjustmentReason ?? '');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);
  const credited = settlement.distributableOwnerKes + settlement.adjustmentKes;

  async function run(key: string, work: () => Promise<unknown>, success: string) {
    setBusy(key);
    setResult(null);
    try {
      await work();
      setResult({ ok: true, text: success });
      router.refresh();
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : "Couldn't save." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-3">
      {canManage ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`adj-${settlement.id}`}>Adjustment (KES, minus to deduct)</Label>
            <Input id={`adj-${settlement.id}`} inputMode="numeric" value={adjustment} onChange={(event) => setAdjustment(event.target.value)} className="w-40" />
          </div>
          <div className="flex min-w-56 flex-1 flex-col gap-1">
            <Label htmlFor={`reason-${settlement.id}`}>Reason</Label>
            <Input id={`reason-${settlement.id}`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Shown on the settlement" />
          </div>
          <Button
            size="sm"
            variant="outline"
            loading={busy === 'adjust'}
            disabled={busy !== null || !/^-?\d*$/.test(adjustment.trim()) || (Number(adjustment || 0) !== 0 && !reason.trim())}
            onClick={() => run('adjust', () => send(`/api/vending/settlements/${settlement.id}`, 'PATCH', { adjustmentKes: Number(adjustment || 0), reason }), 'Adjustment saved.')}
          >
            Save adjustment
          </Button>
          <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => run('discard', () => send(`/api/vending/settlements/${settlement.id}`, 'DELETE'), 'Draft discarded. Prepare the period again when ready.')}>
            Discard draft
          </Button>
        </div>
      ) : null}
      {canFinalize ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <p className="text-sm text-foreground">
            Finalizing credits <span className="font-semibold">{kes(credited)}</span> to the owner’s balance. It can’t be undone.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`confirm-${settlement.id}`}>Type {credited} to confirm</Label>
              <Input id={`confirm-${settlement.id}`} inputMode="numeric" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" className="w-40" />
            </div>
            <Button
              size="sm"
              loading={busy === 'finalize'}
              disabled={busy !== null || typed.trim() !== String(credited) || settlement.outcomeConflictCount > 0}
              onClick={() => run('finalize', () => send(`/api/vending/settlements/${settlement.id}/finalize`, 'POST', { expectedAmountKes: credited }), `Finalized. ${kes(credited)} credited.`)}
            >
              Finalize settlement
            </Button>
          </div>
        </div>
      ) : null}
      {result ? (
        <p role={result.ok ? 'status' : 'alert'} className={`flex items-start gap-2 text-sm ${result.ok ? 'text-success' : 'text-danger'}`}>
          {result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          {result.text}
        </p>
      ) : null}
    </div>
  );
}

/**
 * An owner's settlements: prepare one for a machine and period (see the
 * figures before anything is saved), then adjust, discard or finalize
 * drafts. Finalizing is the only step that moves money; it asks for the
 * amount to be typed, and the server refuses if the draft has changed.
 */
export function SettlementWorkbench({
  partnerId,
  machines,
  settlements,
  canManage,
  canFinalize,
}: {
  partnerId: string;
  machines: { id: string; code: string }[];
  settlements: WorkbenchSettlement[];
  canManage: boolean;
  canFinalize: boolean;
}) {
  const router = useRouter();
  const initial = lastFullMonth();
  const [machineId, setMachineId] = useState(machines[0]?.id ?? '');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [preview, setPreview] = useState<{ figures: Preview; overlapsSettlementId: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [open, setOpen] = useState<string | null>(settlements.find((row) => row.status === 'draft')?.id ?? null);
  const period = () => ({ periodStart: nairobiMidnight(from).toISOString(), periodEnd: nairobiMidnight(addDays(to, 1)).toISOString() });

  async function runPreview() {
    setBusy(true);
    setResult(null);
    setPreview(null);
    try {
      const data = await send(`/api/vending/machines/${machineId}/settlements/preview`, 'POST', period());
      setPreview({ figures: data.preview as Preview, overlapsSettlementId: (data.overlapsSettlementId as string | null) ?? null });
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : "Couldn't work it out." });
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    setBusy(true);
    setResult(null);
    try {
      const data = await send(`/api/vending/machines/${machineId}/settlements`, 'POST', period());
      setResult({ ok: true, text: 'Draft saved. Check it below, then finalize.' });
      setPreview(null);
      setOpen((data.settlementId as string) ?? null);
      router.refresh();
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : "Couldn't save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        <section className="flex flex-col gap-4 rounded-lg border border-border p-4">
          <h2 className="text-base font-semibold text-foreground">Prepare a settlement</h2>
          {machines.length === 0 ? <p className="text-sm text-muted-foreground">This owner has no machines.</p> : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="settle-machine">Machine</Label>
                  <select id="settle-machine" value={machineId} onChange={(event) => { setMachineId(event.target.value); setPreview(null); }} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
                    {machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.code}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="settle-from">From</Label>
                  <Input id="settle-from" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPreview(null); }} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="settle-to">To (inclusive)</Label>
                  <Input id="settle-to" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPreview(null); }} />
                </div>
                <Button variant="outline" loading={busy && !preview} disabled={busy || !machineId || !from || !to || to < from} onClick={runPreview}>Work it out</Button>
              </div>
              <p className="text-xs text-muted-foreground">Whole days in Nairobi time. The period must have ended.</p>
            </>
          )}
          {preview ? (
            <div className="flex flex-col gap-3">
              <Breakdown figures={preview.figures} />
              {preview.overlapsSettlementId ? (
                <p className="text-sm text-danger">This period overlaps a settlement that already exists for this machine. Choose other dates, or discard that draft first.</p>
              ) : (
                <div>
                  <Button loading={busy} disabled={busy} onClick={saveDraft}>Save as draft</Button>
                </div>
              )}
            </div>
          ) : null}
          {result ? (
            <p role={result.ok ? 'status' : 'alert'} className={`flex items-start gap-2 text-sm ${result.ok ? 'text-success' : 'text-danger'}`}>
              {result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
              {result.text}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">Settlements</h2>
          <a href={`/api/vending/partners/${partnerId}/settlements/export`} className="text-sm text-primary hover:underline">Download CSV</a>
        </div>
        {settlements.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {settlements.map((row) => (
              <li key={row.id} className="flex flex-col gap-3 p-3">
                <button type="button" className="flex flex-wrap items-center justify-between gap-2 text-left" onClick={() => setOpen(open === row.id ? null : row.id)} aria-expanded={open === row.id}>
                  <span className="flex flex-col">
                    <span className="font-medium text-foreground">{row.machineCode}: {dayFormat.format(new Date(row.periodStart))} – {dayFormat.format(new Date(new Date(row.periodEnd).getTime() - 1))}</span>
                    <span className="text-sm text-muted-foreground tabular-nums">{kes(row.distributableOwnerKes + row.adjustmentKes)}{row.finalizedAt ? ` · credited ${dayFormat.format(new Date(row.finalizedAt))}` : ''}</span>
                  </span>
                  <Badge variant={row.status === 'draft' ? (row.outcomeConflictCount > 0 ? 'danger' : 'warning') : 'success'}>{row.status === 'draft' ? 'Draft' : row.status === 'finalized' ? 'Finalized' : 'Paid'}</Badge>
                </button>
                {open === row.id ? (
                  <>
                    <Breakdown figures={row} adjustmentKes={row.adjustmentKes} adjustmentReason={row.adjustmentReason} />
                    {row.status === 'draft' ? <DraftActions settlement={row} canManage={canManage} canFinalize={canFinalize} /> : null}
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
