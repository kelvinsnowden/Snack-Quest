'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface HardwareChangeRow {
  id: string;
  at: string | null;
  fromSerial: string;
  toSerial: string;
  reason: string;
}

const day = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric' });

/**
 * New hardware, same machine: its code, slots, catalogue, prices, owner,
 * place and history stay. Only offered while it isn't selling.
 */
export function ReplaceHardwareCard({
  machineId,
  status,
  currentSerial,
  integrated,
  history,
}: {
  machineId: string;
  status: string;
  currentSerial: string;
  integrated: boolean;
  history: HardwareChangeRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ serialNumber: '', model: '', manufacturerMachineId: '', firmwareVersion: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const selling = status === 'active';

  async function replace() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/vending/machines/${machineId}/replace`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const data = (await response.json().catch(() => null)) as { revokedKeys?: string[]; integrationReset?: boolean; error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? `That didn’t save (HTTP ${response.status}).`);
      const next = [
        'Hardware replaced.',
        data?.integrationReset ? 'Test and activate the integration for the new unit before it sells.' : null,
        data?.revokedKeys?.length ? `${data.revokedKeys.length} machine key(s) from the old unit were revoked; issue a new one.` : null,
        'Count the stock in the new unit.',
      ].filter(Boolean);
      setMessage({ tone: 'ok', text: next.join(' ') });
      setOpen(false);
      router.refresh();
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'That didn’t save.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Current unit: <span className="font-medium text-foreground">{currentSerial}</span>
      </p>
      {message ? (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-sm text-danger' : 'text-sm text-success'}>
          {message.text}
        </p>
      ) : null}
      {selling ? (
        <p className="text-sm text-muted-foreground">Move it to Maintenance first, so it isn&rsquo;t selling while the hardware changes.</p>
      ) : open ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="replace-serial">New serial number</Label>
              <Input id="replace-serial" value={values.serialNumber} onChange={set('serialNumber')} autoComplete="off" />
            </div>
            {integrated ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="replace-unit">New unit id (with its manufacturer)</Label>
                <Input id="replace-unit" value={values.manufacturerMachineId} onChange={set('manufacturerMachineId')} autoComplete="off" />
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="replace-model">Model (if different)</Label>
              <Input id="replace-model" value={values.model} onChange={set('model')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="replace-fw">Firmware version (optional)</Label>
              <Input id="replace-fw" value={values.firmwareVersion} onChange={set('firmwareVersion')} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="replace-reason">Why</Label>
              <Input id="replace-reason" value={values.reason} onChange={set('reason')} placeholder="e.g. Board burned out; swapped for a spare" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={replace} loading={busy} disabled={!values.serialNumber.trim() || !values.reason.trim() || (integrated && !values.manufacturerMachineId.trim())}>
              Replace hardware
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            Replace hardware…
          </Button>
        </div>
      )}
      {history.length > 0 ? (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Earlier hardware</p>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {history.map((entry) => (
              <li key={entry.id}>
                {entry.at ? day.format(new Date(entry.at)) : '—'} · {entry.fromSerial} → <span className="text-foreground">{entry.toSerial}</span> · {entry.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
