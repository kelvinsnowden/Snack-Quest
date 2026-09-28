'use client';

import { useState } from 'react';
import { ClipboardCheck, Radar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ReportCheck {
  id: string;
  label: string;
  outcome: 'passed' | 'failed' | 'skipped' | 'not_verified';
  evidence: string;
}

interface ToolReport {
  verdict: string;
  checks: ReportCheck[];
  failures?: string[];
}

const OUTCOME_CLASS: Record<ReportCheck['outcome'], string> = {
  passed: 'text-success',
  failed: 'text-danger',
  skipped: 'text-muted-foreground',
  not_verified: 'text-warning',
};

/**
 * The two manufacturer verification tools on a machine with an
 * integration (docs/MANUFACTURER_CERTIFICATION.md):
 *
 * - **Probe manufacturer API** (Model A) — calls the manufacturer's API
 *   with the stored credential; read-only unless a sandbox vend is
 *   asked for.
 * - **Run certification harness** (Model B, sandbox only) — drives the
 *   manufacturer's sandbox machine through its control endpoints and
 *   optionally records the result against the model.
 *
 * Both are admin-only on the server; this panel only saves typing.
 */
export function CertificationToolsPanel({ machineId, environment, slotIds }: { machineId: string; environment: 'sandbox' | 'production'; slotIds: string[] }) {
  const [probeVend, setProbeVend] = useState(false);
  const [probeSlot, setProbeSlot] = useState(slotIds[0] ?? '');
  const [controlUrl, setControlUrl] = useState('');
  const [controlToken, setControlToken] = useState('');
  const [recordToModel, setRecordToModel] = useState(false);
  const [busy, setBusy] = useState<'probe' | 'harness' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ title: string; data: ToolReport } | null>(null);
  const sandbox = environment === 'sandbox';

  async function call(kind: 'probe' | 'harness', path: string, body: Record<string, unknown>, title: string) {
    setBusy(kind);
    setError(null);
    setReport(null);
    try {
      const response = await fetch(`/api/vending/machines/${machineId}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as { report?: ToolReport; error?: string } | null;
      if (!response.ok || !data?.report) {
        throw new Error(data?.error ?? `The request failed (HTTP ${response.status}).`);
      }
      setReport({ title, data: data.report });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The request failed.');
    } finally {
      setBusy(null);
    }
  }

  function runProbe() {
    if (probeVend && !window.confirm(`This creates one real sandbox vend from slot ${probeSlot || '(none)'} and sends it twice under the same key. Continue?`)) {
      return;
    }
    void call('probe', 'api-probe', { includeVend: probeVend, slotId: probeSlot || undefined }, 'Manufacturer API probe');
  }

  function runHarness() {
    if (!window.confirm('The harness creates three sandbox sales on this machine and dispenses from it. Continue?')) {
      return;
    }
    void call('harness', 'certification-runs', { controlUrl, controlToken, recordToModel }, 'Certification harness');
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2" aria-labelledby="probe-heading">
        <h3 id="probe-heading" className="text-sm font-semibold">Probe manufacturer API</h3>
        <p className="text-caption text-muted-foreground">
          For machines Snack Quest calls (Model A). Uses the manufacturer&apos;s stored {environment} API credential. Read-only unless you include a vend.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {sandbox ? (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={probeVend} onChange={(event) => setProbeVend(event.target.checked)} />
                Include a sandbox vend
              </label>
              {probeVend && slotIds.length > 0 ? (
                <select
                  aria-label="Manufacturer slot for the probe vend"
                  value={probeSlot}
                  onChange={(event) => setProbeSlot(event.target.value)}
                  className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                >
                  {slotIds.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              ) : null}
            </>
          ) : null}
          <Button onClick={runProbe} loading={busy === 'probe'} disabled={busy !== null} size="sm" variant="outline">
            <Radar className="size-4" aria-hidden="true" />
            Probe API
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="harness-heading">
        <h3 id="harness-heading" className="text-sm font-semibold">Run certification harness</h3>
        {sandbox ? (
          <>
            <p className="text-caption text-muted-foreground">
              For machines that call Snack Quest (Model B). Needs the manufacturer&apos;s sandbox control endpoints and one enabled slot with at least 3 items.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="cert-control-url">Control URL</Label>
                <Input id="cert-control-url" type="url" placeholder="https://sandbox.example.com/sq-control" value={controlUrl} onChange={(event) => setControlUrl(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="cert-control-token">Control token</Label>
                <Input id="cert-control-token" type="password" autoComplete="off" value={controlToken} onChange={(event) => setControlToken(event.target.value)} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={recordToModel} onChange={(event) => setRecordToModel(event.target.checked)} />
              Record the result against this machine&apos;s model
            </label>
            <div>
              <Button onClick={runHarness} loading={busy === 'harness'} disabled={busy !== null || !controlUrl || !controlToken} size="sm" variant="outline">
                <ClipboardCheck className="size-4" aria-hidden="true" />
                Run harness
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">The harness runs only against sandbox integrations.</p>
        )}
      </section>

      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      {report ? (
        <section className="flex flex-col gap-2" aria-live="polite">
          <p className="text-sm font-semibold">
            {report.title}: {report.data.verdict}
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {report.data.checks.map((check) => (
              <li key={check.id}>
                <span className={`font-medium ${OUTCOME_CLASS[check.outcome]}`}>{check.outcome.replace('_', ' ')}</span> — {check.label}
                <span className="block text-caption text-muted-foreground">{check.evidence}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
