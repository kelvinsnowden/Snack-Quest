'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Result = { ok: boolean; text: string } | null;

async function post(url: string, body?: unknown): Promise<{ status?: string; errors?: unknown[]; error?: string; httpOk: boolean }> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as { status?: string; errors?: unknown[]; error?: string };
  return { ...data, httpOk: response.ok };
}

function describe(data: { status?: string; errors?: unknown[]; error?: string; httpOk: boolean }): Result {
  if (data.error) return { ok: false, text: data.error };
  if (data.status === 'succeeded') return { ok: true, text: 'Finished.' };
  if (data.status === 'partial') return { ok: false, text: `Finished with ${data.errors?.length ?? 0} problem(s) — see the run below.` };
  return { ok: false, text: 'It failed — see the run below.' };
}

function Message({ result }: { result: Result }) {
  if (!result) return null;
  return (
    <p role={result.ok ? 'status' : 'alert'} className={`flex items-start gap-1.5 text-xs ${result.ok ? 'text-success' : 'text-danger'}`}>
      {result.ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />}
      {result.text}
    </p>
  );
}

/** Runs one scheduled job now, under the same lease as its schedule. */
export function RunJobNowButton({ jobName }: { jobName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      setResult(describe(await post(`/api/admin/jobs/${encodeURIComponent(jobName)}/run`)));
      router.refresh();
    } catch {
      setResult({ ok: false, text: "Couldn't reach the server." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" variant="outline" onClick={run} loading={busy}>
        Run now
      </Button>
      <Message result={result} />
    </div>
  );
}

/** Rebuilds machine, owner and network daily analytics for a range of finished days. */
export function RebuildAnalyticsForm({ defaultStart, defaultEnd }: { defaultStart: string; defaultEnd: string }) {
  const router = useRouter();
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      setResult(describe(await post('/api/vending/rollups/rebuild', { startDate, endDate })));
      router.refresh();
    } catch {
      setResult({ ok: false, text: "Couldn't reach the server." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        After correcting a sale, a price or an owner change from more than three days ago, rebuild those days so machine, owner and network numbers match. Days are counted in UTC, like the rest of
        the analytics; today can’t be rebuilt until it’s over. Up to 92 days at a time.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rebuild-start">First day</Label>
          <Input id="rebuild-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required className="w-44" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rebuild-end">Last day</Label>
          <Input id="rebuild-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required className="w-44" />
        </div>
        <Button type="submit" size="sm" loading={busy} disabled={!startDate || !endDate}>
          Rebuild analytics
        </Button>
      </div>
      <Message result={result} />
    </form>
  );
}
