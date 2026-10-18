'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const when = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function duration(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export interface MachineAgentCardProps {
  machineId: string;
  /** The agent release the machine reported on connect. */
  release: string;
  /** This deployment's release, or null when it couldn't be read. */
  latest: string | null;
  health: { uptimeSeconds: number | null; owedReports: number | null; lastError: string | null; lastErrorAt: string | null; reportedAt: string } | null;
  canUpdate: boolean;
}

/**
 * The Snack Quest Machine Agent on this machine: which release it runs,
 * how it says it is doing, and a button to send it this deployment's
 * release. The update is a command like any other — it shows in the
 * command history, and the machine restarts into the new release after
 * reporting it installed.
 */
export function MachineAgentCard({ machineId, release, latest, health, canUpdate }: MachineAgentCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const behind = latest !== null && latest !== release;

  async function update() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/vending/machines/${machineId}/agent-update`, { method: 'POST' });
      const data = (await response.json().catch(() => null)) as { to?: string; error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? `The update wasn’t sent (HTTP ${response.status}).`);
      setMessage({ tone: 'ok', text: `Sent. The machine installs ${data?.to} on its next check-in and restarts into it.` });
      router.refresh();
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'The update wasn’t sent.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Release</dt>
          <dd className="flex items-center gap-2 font-medium text-foreground">
            {release}
            {behind ? <Badge variant="warning">{latest} available</Badge> : latest ? <Badge variant="success">Latest</Badge> : null}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Running for</dt>
          <dd className="font-medium text-foreground">{health?.uptimeSeconds != null ? duration(health.uptimeSeconds) : '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Reports waiting to send</dt>
          <dd className={health?.owedReports ? 'font-medium text-warning' : 'font-medium text-foreground'}>{health?.owedReports ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last report</dt>
          <dd className="font-medium text-foreground">{health ? when.format(new Date(health.reportedAt)) : '—'}</dd>
        </div>
      </dl>

      {health?.lastError ? (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <span>
            Last problem{health.lastErrorAt ? ` (${when.format(new Date(health.lastErrorAt))})` : ''}: {health.lastError}
          </span>
        </p>
      ) : null}

      {message ? (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-sm text-danger' : 'text-sm text-success'}>
          {message.text}
        </p>
      ) : null}

      {canUpdate && behind ? (
        <div>
          <Button type="button" size="sm" variant="outline" onClick={update} loading={busy}>
            <Download className="size-4" aria-hidden="true" />
            Update to {latest}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
