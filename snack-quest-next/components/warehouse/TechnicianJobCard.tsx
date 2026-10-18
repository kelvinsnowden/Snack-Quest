'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface JobCardData {
  id: string;
  kind: 'maintenance' | 'restock';
  machineCode: string;
  title: string;
  detail: string | null;
  place: { name: string; address: string | null; mapUrl: string | null } | null;
  checklist: { label: string; done: boolean }[];
}

/**
 * One job on a technician's phone: where, what, the checklist (ticks save
 * as they're tapped, so a dropped signal loses at most one), and finish.
 * Big tap targets; nothing here needs a keyboard except the closing note.
 */
export function TechnicianJobCard({ job }: { job: JobCardData }) {
  const router = useRouter();
  const [checklist, setChecklist] = useState(job.checklist);
  const [note, setNote] = useState('');
  const [fixed, setFixed] = useState(job.kind === 'maintenance');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const left = checklist.filter((item) => !item.done).length;

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

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/vending/technician-jobs/${job.id}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note, fixed }) });
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
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{job.kind === 'restock' ? 'Restock' : 'Maintenance'}</p>
        <h2 className="text-lg font-semibold text-foreground">
          {job.machineCode} · {job.title}
        </h2>
        {job.detail ? <p className="text-sm text-muted-foreground">{job.detail}</p> : null}
        {job.place ? (
          <p className="flex items-start gap-1.5 text-sm text-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              {job.place.name}
              {job.place.address ? `, ${job.place.address}` : ''}
              {job.place.mapUrl ? (
                <>
                  {' · '}
                  <a href={job.place.mapUrl} target="_blank" rel="noreferrer" className="font-medium text-primary underline">
                    Directions
                  </a>
                </>
              ) : null}
            </span>
          </p>
        ) : null}
      </header>

      <ul className="flex flex-col">
        {checklist.map((item, index) => (
          <li key={item.label}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-border text-sm text-foreground last:border-0">
              <Checkbox checked={item.done} onCheckedChange={(checked) => tick(index, checked === true)} className="size-6" />
              <span className={item.done ? 'text-muted-foreground line-through' : ''}>{item.label}</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`note-${job.id}`}>{left > 0 ? `Note (needed: ${left} not done — say why)` : 'Note (optional)'}</Label>
        <Textarea id={`note-${job.id}`} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What you found and did" />
      </div>
      {job.kind === 'maintenance' ? (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Checkbox checked={fixed} onCheckedChange={(checked) => setFixed(checked === true)} />
          The problem is fixed (closes the request)
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="button" size="lg" onClick={finish} loading={busy} disabled={left > 0 && note.trim().length < 3}>
        <Check className="size-5" aria-hidden="true" />
        Finish job
      </Button>
    </article>
  );
}
