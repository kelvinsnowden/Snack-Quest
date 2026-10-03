'use client';

import { useEffect, useState } from 'react';
import { Delete, Wrench, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Asks for the one-time service code (§ KIOSK SERVICE MODE). Opened by
 * pressing and holding the logo; a customer who finds it sees "Staff only"
 * and a way out. The code is checked by the server, never on the screen.
 */
export function ServiceCodePrompt({ onSubmit, onCancel }: { onSubmit: (code: string) => Promise<string | null>; onCancel: () => void }) {
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(code: string) {
    setBusy(true);
    setError(null);
    const problem = await onSubmit(code);
    setBusy(false);
    if (problem) {
      setError(problem);
      setDigits('');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-6" role="dialog" aria-modal="true" aria-labelledby="service-code-title">
      <div className="flex w-full max-w-sm flex-col gap-5 rounded-xl bg-surface p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="service-code-title" className="text-card-title font-semibold text-foreground">
              Staff only
            </h2>
            <p className="text-small text-muted-foreground">Enter the 8-digit service code from Admin.</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" className="flex size-12 items-center justify-center rounded-full bg-background">
            <X className="size-6" aria-hidden="true" />
          </button>
        </div>
        <p aria-live="polite" className="text-center font-mono text-section-title tracking-[0.3em] tabular-nums text-foreground">
          {digits.padEnd(8, '•')}
        </p>
        {error ? (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
            {error}
          </p>
        ) : null}
        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button key={digit} type="button" disabled={busy || digits.length >= 8} onClick={() => setDigits((d) => d + digit)} className="h-14 rounded-lg bg-background text-card-title font-semibold text-foreground disabled:opacity-50">
              {digit}
            </button>
          ))}
          <button type="button" disabled={busy} onClick={() => setDigits((d) => d.slice(0, -1))} aria-label="Delete last digit" className="flex h-14 items-center justify-center rounded-lg bg-background text-foreground">
            <Delete className="size-6" aria-hidden="true" />
          </button>
          <button type="button" disabled={busy || digits.length >= 8} onClick={() => setDigits((d) => d + '0')} className="h-14 rounded-lg bg-background text-card-title font-semibold text-foreground disabled:opacity-50">
            0
          </button>
          <Button size="lg" className="h-14" loading={busy} disabled={digits.length !== 8} onClick={() => submit(digits)}>
            Open
          </Button>
        </div>
      </div>
    </div>
  );
}

export interface ServiceInfo {
  machineCode: string;
  online: boolean;
  packageVersion: string | null;
  catalogVersion: string | null;
  lastContentAt: string | null;
  campaigns: number;
  cachedCreatives: number;
  pendingAdEvents: number;
  pendingReports: number;
  droppedEvents: number;
}

/**
 * The service screen (§ KIOSK SERVICE MODE): what this screen is showing
 * and what it hasn't reported yet, with the few things a technician needs
 * on site. It controls only the screen — never the machine's motors, never
 * payments. Closes itself when the session ends.
 */
export function ServiceScreen({
  getInfo,
  expiresAt,
  onSync,
  onFlush,
  onClearCache,
  onExit,
}: {
  /** Read on open and every second after, so the figures stay current. */
  getInfo: () => ServiceInfo;
  expiresAt: number;
  onSync: () => Promise<void>;
  onFlush: () => Promise<void>;
  onClearCache: () => Promise<void>;
  onExit: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [info, setInfo] = useState<ServiceInfo | null>(null);
  useEffect(() => {
    const refresh = () => {
      setNow(Date.now());
      setInfo(getInfo());
    };
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, [getInfo]);
  useEffect(() => {
    if (now >= expiresAt) onExit();
  }, [now, expiresAt, onExit]);
  const remaining = Math.max(0, Math.round((expiresAt - now) / 1000));

  async function run(label: string, action: () => Promise<void>, done: string) {
    setBusy(label);
    setMessage(null);
    try {
      await action();
      setMessage(done);
    } catch {
      setMessage('That didn’t work. Check the connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  if (!info) return null;
  const rows: [string, string][] = [
    ['Machine', info.machineCode],
    ['Connection', info.online ? 'Online' : 'Offline — showing the last content'],
    ['Screen content version', info.packageVersion ?? 'none yet'],
    ['Menu version', info.catalogVersion ?? 'none yet'],
    ['Content last applied', info.lastContentAt ? new Date(info.lastContentAt).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }) : 'not since this screen started'],
    ['Ad campaigns on this screen', String(info.campaigns)],
    ['Ad files verified and cached', String(info.cachedCreatives)],
    ['Ad plays waiting to report', String(info.pendingAdEvents)],
    ['Activity reports waiting', String(info.pendingReports)],
    ['Reports dropped (storage full)', String(info.droppedEvents)],
  ];

  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-background p-6 lg:p-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-3 text-section-title font-semibold text-foreground">
          <Wrench className="size-8" aria-hidden="true" />
          Service mode
        </h1>
        <span className="text-body tabular-nums text-muted-foreground">
          Closes in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
        </span>
      </header>
      <dl className="grid max-w-3xl grid-cols-[auto_1fr] gap-x-8 gap-y-3 rounded-xl bg-surface p-6 text-body">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-all font-medium tabular-nums text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-3">
        <Button size="lg" loading={busy === 'sync'} disabled={Boolean(busy)} onClick={() => run('sync', onSync, 'Menu and screen content fetched.')}>
          Sync now
        </Button>
        <Button size="lg" variant="outline" loading={busy === 'flush'} disabled={Boolean(busy)} onClick={() => run('flush', onFlush, 'Reports sent.')}>
          Send reports now
        </Button>
        <Button size="lg" variant="outline" loading={busy === 'clear'} disabled={Boolean(busy)} onClick={() => run('clear', onClearCache, 'Cached ad files cleared; they download again at the next sync.')}>
          Clear cached ad files
        </Button>
        <Button size="lg" variant="ghost" onClick={onExit}>
          Close service mode
        </Button>
      </div>
      {message ? (
        <p role="status" className="text-body text-foreground">
          {message}
        </p>
      ) : null}
      <p className="max-w-prose text-small text-muted-foreground">Service mode shows and refreshes this screen only. Machine commands, stock and prices are managed from Admin.</p>
    </main>
  );
}
