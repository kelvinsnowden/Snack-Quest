import { Badge } from '@/components/ui/badge';
import type { CertificationRunSummary } from '@/services/manufacturerOnboardingService';

/** Every certification-harness run against this manufacturer's machines, newest first. Runs against Snack Quest's own simulator are labelled: they prove the harness, not the manufacturer. */
export function CertificationRuns({ runs }: { runs: CertificationRunSummary[] }) {
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">No harness runs yet. Run the certification harness against their sandbox machine to record one.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2 pr-4 font-medium">When</th>
            <th className="py-2 pr-4 font-medium">Machine</th>
            <th className="py-2 pr-4 font-medium">Verdict</th>
            <th className="py-2 font-medium">Failures</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.runId} className="border-b border-border last:border-0 align-top">
              <td className="py-2 pr-4 tabular-nums text-muted-foreground">{run.at ? new Date(run.at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
              <td className="py-2 pr-4">{run.machineCode}{run.subject === 'snack_quest_simulator' ? <span className="text-caption text-muted-foreground"> (simulator)</span> : null}</td>
              <td className="py-2 pr-4"><Badge variant={run.verdict === 'CERTIFIED' ? 'success' : 'warning'}>{run.verdict}</Badge></td>
              <td className="py-2 text-muted-foreground">{run.failures.length ? run.failures.join('; ') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
