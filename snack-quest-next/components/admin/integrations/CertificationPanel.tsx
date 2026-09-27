'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CERTIFICATION_CHECKS, type CertificationCheckKey, type ModelCertificationStatus } from '@/types';
import { sendJson } from './sendJson';

export interface ChecklistEntry {
  outcome: 'passed' | 'failed' | 'not_applicable';
  evidence: string;
  verifiedBy: string;
  verifiedAt: string;
}

const OUTCOME_BADGE: Record<ChecklistEntry['outcome'], { label: string; variant: 'success' | 'danger' | 'outline' }> = {
  passed: { label: 'Passed', variant: 'success' },
  failed: { label: 'Failed', variant: 'danger' },
  not_applicable: { label: 'N/A', variant: 'outline' },
};

/**
 * The production gate for one model (§ MACHINE CERTIFICATION). Every
 * check needs evidence; Certify is refused by the server until every
 * required check has passed.
 */
export function CertificationPanel({ modelId, status, checklist }: { modelId: string; status: ModelCertificationStatus; checklist: Partial<Record<CertificationCheckKey, ChecklistEntry>> }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CertificationCheckKey | null>(null);
  const [outcome, setOutcome] = useState<ChecklistEntry['outcome']>('passed');
  const [evidence, setEvidence] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const outstanding = CERTIFICATION_CHECKS.filter(({ key, mayBeNotApplicable }) => {
    const entry = checklist[key];
    return !entry || !(entry.outcome === 'passed' || (entry.outcome === 'not_applicable' && mayBeNotApplicable));
  });

  async function run(label: string, url: string, body: unknown) {
    setBusy(label);
    setError(null);
    try {
      await sendJson(url, 'POST', body);
      setEditing(null);
      setEvidence('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refused.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Check</th>
              <th className="py-2 pr-4 font-medium">Result</th>
              <th className="py-2 pr-4 font-medium">Evidence</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {CERTIFICATION_CHECKS.map(({ key, label, mayBeNotApplicable }) => {
              const entry = checklist[key];
              return (
                <tr key={key} className="border-b border-border last:border-0 align-top">
                  <td className="py-2 pr-4">{label}</td>
                  <td className="py-2 pr-4">{entry ? <Badge variant={OUTCOME_BADGE[entry.outcome].variant}>{OUTCOME_BADGE[entry.outcome].label}</Badge> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {editing === key ? (
                      <div className="flex flex-col gap-2 md:flex-row">
                        <select className="h-10 rounded-md border border-border bg-surface px-2 text-sm" value={outcome} onChange={(event) => setOutcome(event.target.value as ChecklistEntry['outcome'])}>
                          <option value="passed">Passed</option>
                          <option value="failed">Failed</option>
                          {mayBeNotApplicable ? <option value="not_applicable">Not applicable</option> : null}
                        </select>
                        <Input placeholder="What was observed — event id, test run, transaction ref" value={evidence} onChange={(event) => setEvidence(event.target.value)} />
                        <Button size="sm" loading={busy === key} disabled={!evidence.trim()} onClick={() => run(key, `/api/vending/integrations/models/${modelId}/checks`, { key, outcome, evidence })}>Save</Button>
                      </div>
                    ) : (
                      entry?.evidence ?? ''
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {editing === key ? null : (
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(key); setOutcome(entry?.outcome ?? 'passed'); setEvidence(''); }}>
                        Record
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {status !== 'certified' ? (
          <Button size="sm" loading={busy === 'certify'} disabled={busy !== null || outstanding.length > 0} onClick={() => run('certify', `/api/vending/integrations/models/${modelId}/certify`, {})}>
            Certify for production
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            loading={busy === 'revoke'}
            onClick={() => {
              const reason = window.prompt('Why is certification being revoked?');
              if (reason) void run('revoke', `/api/vending/integrations/models/${modelId}/revoke-certification`, { reason });
            }}
          >
            Revoke certification
          </Button>
        )}
        {status !== 'certified' && outstanding.length > 0 ? (
          <p className="text-caption text-muted-foreground">{outstanding.length} check{outstanding.length === 1 ? '' : 's'} outstanding before this model can be certified.</p>
        ) : null}
      </div>
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
    </div>
  );
}
