'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Camera as CameraIcon, PlayCircle, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The owner's own camera actions — deliberately a subset of
 * `components/admin/CameraActions.tsx`: test/capture/stream-info
 * only, never activate/disable/health-check, which stay
 * `ADMIN_ONLY` staff actions. An owner can look at their camera and
 * prove it's reachable, never reconfigure it.
 */
export function PartnerCameraActions({ cameraId, canSnapshot, canStream }: { cameraId: string; canSnapshot: boolean; canStream: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [streamInfo, setStreamInfo] = useState<string | null>(null);

  async function run(action: string, path: string, method: 'GET' | 'POST') {
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/vending/partners/me/cameras/${cameraId}${path}`, {
        method,
        headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
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
      } else if (action === 'snapshot') {
        const snapshot = data?.snapshot as { success?: boolean; errorMessage?: string | null } | undefined;
        setMessage(snapshot?.success ? 'Snapshot captured.' : `Snapshot failed — ${snapshot?.errorMessage ?? 'unknown error'}`);
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
        {canSnapshot ? (
          <Button onClick={() => run('snapshot', '/snapshot', 'POST')} loading={busy === 'snapshot'} size="sm" variant="outline">
            <CameraIcon className="size-4" aria-hidden="true" />
            Take snapshot
          </Button>
        ) : null}
        {canStream ? (
          <Button onClick={() => run('stream-info', '/stream-info', 'GET')} loading={busy === 'stream-info'} size="sm" variant="outline">
            <Radio className="size-4" aria-hidden="true" />
            View live stream info
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
