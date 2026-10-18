'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, MapPin, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { RestockJobFlow, type RestockJobData } from '@/components/warehouse/RestockJobFlow';

export interface JobCardData {
  id: string;
  kind: 'maintenance' | 'restock';
  machineCode: string;
  title: string;
  detail: string | null;
  urgent?: boolean;
  place: { name: string; address: string | null; mapUrl: string | null } | null;
  checklist: { label: string; done: boolean }[];
  /** Present for restock jobs: the restock's stage and what goes where. */
  restock?: RestockJobData;
}

/**
 * One job on a technician's phone: where, what, and — for a restock — the
 * pack / travel / load steps with product photos; then the on-site
 * checklist (ticks save as they're tapped, so a dropped signal loses at
 * most one) and Finish. Every target is thumb-sized; the only typing is
 * the closing note, and only when something wasn't done.
 */
export function TechnicianJobCard({ job }: { job: JobCardData }) {
  const router = useRouter();
  const [checklist, setChecklist] = useState(job.checklist);
  const [note, setNote] = useState('');
  const [fixed, setFixed] = useState(job.kind === 'maintenance');
  const [loaded, setLoaded] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const left = checklist.filter((item) => !item.done).length;
  const restock = job.restock;
  const atMachine = !restock || restock.status === 'in_transit';
  const short = restock ? restock.lines.filter((line) => (loaded[line.slotId] ?? line.quantity) < line.quantity).length : 0;
  const needsNote = left > 0 || short > 0;

  async function tick(index: number, done: boolean) {
    setChecklist((items) => items.map((item, at) => (at === index ? { ...item, done } : item)));
    setError(null);
    const response = await fetch(`/api/vending/technician-jobs/${job.id}/checklist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index, done }) });
    if (!response.ok) {
      setChecklist((items) => items.map((item, at) => (at === index ? { ...item, done: !done } : item)));
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? 'That tick didn’t save. Check your signal and try again.');
    }
  }

  async function advance(path: string, body?: unknown): Promise<boolean> {
    if (!restock) return false;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/vending/restock/${restock.taskId}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? 'That didn’t save. Check your signal and try again.');
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t save.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/vending/technician-jobs/${job.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note,
          fixed,
          loaded: restock ? restock.lines.map((line) => ({ slotId: line.slotId, quantity: loaded[line.slotId] ?? line.quantity })) : undefined,
        }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? 'Not saved.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-4 sm:p-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{job.kind === 'restock' ? 'Restock' : 'Maintenance'}</span>
          {job.urgent ? <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-semibold text-danger">Urgent</span> : null}
        </div>
        <h2 className="text-xl font-semibold text-foreground">
          {job.machineCode}
          <span className="font-normal text-muted-foreground"> · {job.title}</span>
        </h2>
        {job.detail ? <p className="text-sm text-muted-foreground">{job.detail}</p> : null}
        {job.place ? (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background p-3">
            <p className="flex min-w-0 items-start gap-2 text-sm text-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>
                <span className="font-medium">{job.place.name}</span>
                {job.place.address ? <span className="block text-muted-foreground">{job.place.address}</span> : null}
              </span>
            </p>
            {job.place.mapUrl ? (
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <a href={job.place.mapUrl} target="_blank" rel="noreferrer">
                  <Navigation className="size-4" aria-hidden="true" />
                  Directions
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      {restock ? <RestockJobFlow restock={restock} busy={busy} onAdvance={advance} loaded={loaded} setLoaded={setLoaded} /> : null}

      {atMachine ? (
        <>
          <section className="flex flex-col gap-1" aria-labelledby={`check-${job.id}`}>
            <div className="flex items-baseline justify-between gap-2">
              <h3 id={`check-${job.id}`} className="text-base font-semibold text-foreground">
                At the machine
              </h3>
              <span className="text-sm text-muted-foreground">
                {checklist.length - left}/{checklist.length} done
              </span>
            </div>
            <ul className="flex flex-col">
              {checklist.map((item, index) => (
                <li key={item.label}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-border text-sm text-foreground last:border-0">
                    <Checkbox checked={item.done} onCheckedChange={(checked) => tick(index, checked === true)} className="size-6" />
                    <span className={cn('transition-colors duration-150', item.done ? 'text-muted-foreground line-through' : '')}>{item.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`note-${job.id}`}>
              {needsNote ? 'What happened (needed)' : 'Note (optional)'}
            </Label>
            <Textarea id={`note-${job.id}`} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder={short > 0 ? 'Why fewer went in — e.g. two packets were damaged' : 'What you found and did'} />
            {needsNote ? (
              <p className="text-xs text-muted-foreground">
                {[left > 0 ? `${left} check${left === 1 ? '' : 's'} not done` : null, short > 0 ? `${short} slot${short === 1 ? '' : 's'} short` : null].filter(Boolean).join(' · ')} — say why.
              </p>
            ) : null}
          </div>

          {job.kind === 'maintenance' ? (
            <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
              <Checkbox checked={fixed} onCheckedChange={(checked) => setFixed(checked === true)} className="size-6" />
              The problem is fixed (closes the request)
            </label>
          ) : null}
        </>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {atMachine ? (
        <Button type="button" size="lg" onClick={finish} loading={busy} disabled={needsNote && note.trim().length < 3}>
          <Check className="size-5" aria-hidden="true" />
          {restock ? 'Machine loaded — finish' : 'Finish job'}
        </Button>
      ) : null}
    </article>
  );
}
