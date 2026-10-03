'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

const STATUS_LABEL: Record<string, string> = {
  provisioning: 'Registered',
  installing: 'Being installed',
  testing: 'Testing',
  active: 'Selling',
  maintenance: 'In maintenance',
  offline: 'Offline',
  decommissioned: 'Retired',
};

const STATUS_HELP: Record<string, string> = {
  active: 'Customers can buy from it.',
  maintenance: 'Stops sales while someone works on it.',
  offline: 'Marks it as not reachable; no sales.',
  decommissioned: 'Retires it for good. It can never sell again.',
  installing: 'Back to installation.',
  testing: 'Installed and being tested; not selling yet.',
  provisioning: 'Back to registered.',
};

async function patchMachine(machineId: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(`/api/vending/machines/${machineId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
  if (!response.ok) throw new Error(data?.message ?? data?.error ?? `Couldn't save (HTTP ${response.status}).`);
}

/** Move a machine through its life: installed, tested, selling, paused, retired. Only the next steps the machine allows are offered. */
export function MachineStatusControl({ machineId, machineCode, status, next, canEdit }: { machineId: string; machineCode: string; status: string; next: string[]; canEdit: boolean }) {
  const router = useRouter();
  const [target, setTarget] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const retiring = target === 'decommissioned';

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await patchMachine(machineId, { status: target });
      setMessage({ ok: true, text: `Now: ${STATUS_LABEL[target] ?? target}.` });
      setTarget('');
      setConfirmText('');
      router.refresh();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Couldn't save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-foreground">
        Now: <span className="font-semibold">{STATUS_LABEL[status] ?? status}</span>
      </p>
      {!canEdit ? null : next.length === 0 ? (
        <p className="text-sm text-muted-foreground">This machine is retired; its status can’t change.</p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="machine-status">Change to</Label>
            <select id="machine-status" value={target} onChange={(event) => setTarget(event.target.value)} disabled={busy} className="h-10 max-w-xs rounded-lg border border-border bg-background px-3 text-sm">
              <option value="">Choose…</option>
              {next.map((value) => <option key={value} value={value}>{STATUS_LABEL[value] ?? value}</option>)}
            </select>
            {target ? <p className="text-xs text-muted-foreground">{STATUS_HELP[target]}</p> : null}
          </div>
          {retiring ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="retire-confirm">Type {machineCode} to confirm</Label>
              <Input id="retire-confirm" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} autoComplete="off" className="max-w-xs" />
            </div>
          ) : null}
          <div>
            <Button size="sm" onClick={save} loading={busy} disabled={!target || (retiring && confirmText.trim() !== machineCode)} variant={retiring ? 'danger' : 'primary'}>
              {retiring ? 'Retire machine' : 'Change status'}
            </Button>
          </div>
        </>
      )}
      {message ? (
        <p role={message.ok ? 'status' : 'alert'} className={`flex items-start gap-2 text-sm ${message.ok ? 'text-success' : 'text-danger'}`}>
          {message.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

/** Move a machine to another location. The old placement is closed and kept in its history, so sales stay attributed to where they happened. */
export function MachineMoveControl({ machineId, currentLocationId, locations, canEdit }: { machineId: string; currentLocationId: string | null; locations: { id: string; name: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const current = locations.find((location) => location.id === currentLocationId);

  async function save() {
    const location = locations.find((entry) => entry.id === target);
    setBusy(true);
    setMessage(null);
    try {
      await patchMachine(machineId, { locationId: target === '__none__' ? null : target, venueName: location?.name ?? null, relocationReason: reason.trim() || null });
      setMessage({ ok: true, text: target === '__none__' ? 'Removed from its location.' : `Moved to ${location?.name}.` });
      setTarget('');
      setReason('');
      router.refresh();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Couldn't move it." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-foreground">
        Now at: <span className="font-semibold">{current?.name ?? 'no location'}</span>
      </p>
      {canEdit ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="machine-move">Move to</Label>
            <select id="machine-move" value={target} onChange={(event) => setTarget(event.target.value)} disabled={busy} className="h-10 max-w-sm rounded-lg border border-border bg-background px-3 text-sm">
              <option value="">Choose a location…</option>
              {locations.filter((location) => location.id !== currentLocationId).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              {currentLocationId ? <option value="__none__">Take it out of service (no location)</option> : null}
            </select>
            {locations.length === 0 ? <p className="text-xs text-muted-foreground">No locations yet — add one under Locations first.</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="move-reason">Why (kept in its history)</Label>
            <Input id="move-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Site closed for renovation" className="max-w-sm" />
          </div>
          <div>
            <Button size="sm" onClick={save} loading={busy} disabled={!target}>Move machine</Button>
          </div>
        </>
      ) : null}
      {message ? (
        <p role={message.ok ? 'status' : 'alert'} className={`flex items-start gap-2 text-sm ${message.ok ? 'text-success' : 'text-danger'}`}>
          {message.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
