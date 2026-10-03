'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DeviceKeyReveal } from '@/components/admin/vending/DeviceKeyReveal';

export interface DeviceKeyRow {
  id: string;
  prefix: string;
  issuedAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
}

const when = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const format = (iso: string | null) => (iso ? when.format(new Date(iso)) : '—');

async function post(url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) throw new Error((data?.message as string) ?? (data?.error as string) ?? `Couldn't save (HTTP ${response.status}).`);
  return data ?? {};
}

function RevokeKey({ machineId, machineCode, keyRow, onDone }: { machineId: string; machineCode: string; keyRow: DeviceKeyRow; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      await post(`/api/vending/machines/${machineId}/credentials/${keyRow.id}/revoke`, { reason });
      setOpen(false);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't revoke.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Revoke…</Button>;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-danger/40 p-3">
      <p className="text-sm text-foreground">Anything using key {keyRow.prefix}… stops working at once. If it’s the screen’s only key, the screen goes back to its pairing page.</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`reason-${keyRow.id}`}>Why</Label>
        <Input id={`reason-${keyRow.id}`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Tablet replaced" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`confirm-${keyRow.id}`}>Type {machineCode} to confirm</Label>
        <Input id={`confirm-${keyRow.id}`} value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
      </div>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" variant="danger" loading={busy} disabled={!reason.trim() || typed.trim() !== machineCode} onClick={revoke}>Revoke key</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

/**
 * A machine's screen keys: which exist, when each was last used, and
 * ways to issue a new one or kill one. Only a hash of each key is kept,
 * so a lost key is replaced, never looked up.
 */
export function DeviceKeysCard({ machineId, machineCode, keys }: { machineId: string; machineCode: string; keys: DeviceKeyRow[] }) {
  const router = useRouter();
  const [issuing, setIssuing] = useState(false);
  const [revokeOthers, setRevokeOthers] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const active = keys.filter((key) => !key.revokedAt);

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      const data = await post(`/api/vending/machines/${machineId}/credentials`, { revokeOthers, reason: reason.trim() || null });
      setNewSecret((data.credential as { secret: string }).secret);
      setIssuing(false);
      setRevokeOthers(false);
      setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't issue a key.");
    } finally {
      setBusy(false);
    }
  }

  function finishReveal() {
    setNewSecret(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {newSecret ? <DeviceKeyReveal machineCode={machineCode} secret={newSecret} onDone={finishReveal} /> : null}

      {active.length === 0 ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          No working key — the screen can’t pair or sell until one is issued.
        </p>
      ) : active.length > 1 ? (
        <p className="text-sm text-muted-foreground">{active.length} keys work right now. Once the screen uses the newest, revoke the others.</p>
      ) : null}

      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {keys.length === 0 ? <li className="p-3 text-sm text-muted-foreground">No keys issued.</li> : null}
        {keys.map((key) => (
          <li key={key.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="flex items-center gap-2">
                <KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />
                <code className="font-mono text-foreground">{key.prefix}…</code>
                {key.revokedAt ? <Badge variant="outline">Revoked</Badge> : <Badge variant="success">Working</Badge>}
              </span>
              <span className="text-muted-foreground">
                Issued {format(key.issuedAt)} · last used {key.lastUsedAt ? format(key.lastUsedAt) : 'never'}
              </span>
              {key.revokedAt ? (
                <span className="text-muted-foreground">
                  Revoked {format(key.revokedAt)}
                  {key.revokedReason ? ` · ${key.revokedReason}` : ''}
                </span>
              ) : null}
            </div>
            {!key.revokedAt ? <RevokeKey machineId={machineId} machineCode={machineCode} keyRow={key} onDone={() => router.refresh()} /> : null}
          </li>
        ))}
      </ul>

      {issuing ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-primary)]" checked={revokeOthers} onChange={(event) => setRevokeOthers(event.target.checked)} disabled={active.length === 0} />
            <span>
              Revoke every other key now
              <span className="block text-xs text-muted-foreground">Use this if a key may have leaked. The screen stops until it’s paired with the new key.</span>
            </span>
          </label>
          {revokeOthers ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="replace-reason">Why</Label>
              <Input id="replace-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Key shared by mistake" />
            </div>
          ) : null}
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          <div className="flex gap-2">
            <Button size="sm" loading={busy} disabled={revokeOthers && !reason.trim()} onClick={issue} variant={revokeOthers ? 'danger' : 'primary'}>
              {revokeOthers ? 'Replace all keys' : 'Issue new key'}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setIssuing(false)}>Cancel</Button>
          </div>
        </div>
      ) : !newSecret ? (
        <div>
          <Button size="sm" variant="outline" onClick={() => setIssuing(true)}>New key…</Button>
        </div>
      ) : null}
    </div>
  );
}
