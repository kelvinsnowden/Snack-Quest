'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, PlayCircle, Activity, Camera as CameraIcon, Power, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CameraStatus } from '@/types';

/**
 * §9 ADMIN UI — the actions a camera's own current state and
 * declared capabilities actually offer, never every button at once
 * (the same discipline `RestockTaskActions`/`TestVendAction` already
 * follow for their own domains). A capability the resolved adapter
 * doesn't declare means its button is hidden entirely, not shown
 * disabled with no explanation (§9: "If a capability is unavailable,
 * disable/hide the action rather than pretending it works").
 */
export function CameraActions({
  cameraId,
  status,
  canSnapshot,
  canStream,
  canHealthCheck,
}: {
  cameraId: string;
  status: CameraStatus;
  canSnapshot: boolean;
  canStream: boolean;
  canHealthCheck: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [streamInfo, setStreamInfo] = useState<string | null>(null);

  async function run(action: string, path: string, method: 'GET' | 'POST', confirmMessage?: string) {
    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/vending/cameras/${cameraId}${path}`, {
        method,
        headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body: method === 'POST' ? JSON.stringify({}) : undefined,
      });
      const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        throw new Error((data?.error as string) ?? `Action failed (HTTP ${response.status}).`);
      }
      if (action === 'stream-info') {
        const info = data?.streamInfo as { available?: boolean; protocol?: string | null; host?: string | null; port?: number | null } | undefined;
        setStreamInfo(info?.available ? `${info.protocol ?? 'unknown'} — ${info.host ?? '—'}:${info.port ?? '—'}` : 'Stream unavailable');
      } else if (action === 'test') {
        setMessage((data?.ok as boolean) ? 'Connection succeeded.' : `Connection failed — ${(data?.error as string) ?? 'unknown error'}`);
      } else if (action === 'health-check') {
        setMessage((data?.ok as boolean) ? 'Healthy.' : `Unhealthy — ${(data?.error as string) ?? 'unknown error'}`);
      } else if (action === 'snapshot') {
        const snapshot = data?.snapshot as { success?: boolean; errorMessage?: string | null } | undefined;
        setMessage(snapshot?.success ? 'Snapshot captured.' : `Snapshot failed — ${snapshot?.errorMessage ?? 'unknown error'}`);
      } else {
        setMessage('Done.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => run('test', '/test', 'POST')} loading={busy === 'test'} size="sm" variant="outline">
          <PlayCircle className="size-4" aria-hidden="true" />
          Test connection
        </Button>

        {canHealthCheck ? (
          <Button onClick={() => run('health-check', '/health-check', 'POST')} loading={busy === 'health-check'} size="sm" variant="outline">
            <Activity className="size-4" aria-hidden="true" />
            Run health check
          </Button>
        ) : null}

        {canSnapshot ? (
          <Button onClick={() => run('snapshot', '/snapshot', 'POST')} loading={busy === 'snapshot'} size="sm" variant="outline">
            <CameraIcon className="size-4" aria-hidden="true" />
            Capture snapshot
          </Button>
        ) : null}

        {canStream ? (
          <Button onClick={() => run('stream-info', '/stream-info', 'GET')} loading={busy === 'stream-info'} size="sm" variant="outline">
            <Radio className="size-4" aria-hidden="true" />
            View stream information
          </Button>
        ) : null}

        {status === 'configured' ? (
          <Button onClick={() => run('activate', '/activate', 'POST')} loading={busy === 'activate'} size="sm" variant="outline">
            <Power className="size-4" aria-hidden="true" />
            Activate
          </Button>
        ) : null}

        {status === 'active' || status === 'configured' || status === 'error' ? (
          <Button
            onClick={() => run('disable', '/disable', 'POST', 'This takes the camera out of service. Continue?')}
            loading={busy === 'disable'}
            size="sm"
            variant="outline"
          >
            <Power className="size-4" aria-hidden="true" />
            Disable
          </Button>
        ) : null}
      </div>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      {streamInfo ? <p className="text-sm text-muted-foreground">Stream: {streamInfo}</p> : null}
      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
