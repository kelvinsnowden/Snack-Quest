'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Copy, KeyRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface AgentKeyRow {
  keyId: string;
  environment: string;
  status: string;
  issuedAt: string | null;
  lastUsedAt: string | null;
}

const when = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric' });
const format = (iso: string | null) => (iso ? when.format(new Date(iso)) : '—');

/** The site the config points the agent at — the installer comes from the same place. */
function siteOf(config: string): string {
  try {
    return (JSON.parse(config) as { snackQuest: { baseUrl: string } }).snackQuest.baseUrl;
  } catch {
    return 'https://www.snackquests.shop';
  }
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(text).then(() => setCopied(true), () => undefined);
          }}
        >
          <Copy className="size-4" aria-hidden="true" />
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre className="max-h-64 overflow-auto rounded-md border border-border bg-surface p-3 text-xs text-foreground">{text}</pre>
    </div>
  );
}

/**
 * The key the Machine Agent on this machine signs with — one that speaks
 * for this machine only. Issuing shows the secret once, with the agent's
 * config already filled in (site, key, the machine's id, its mapped
 * lanes) and the install command, so setting up a machine is copy and
 * paste.
 */
export function AgentKeyCard({ machineId, machineCode, keys }: { machineId: string; machineCode: string; keys: AgentKeyRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ keyId: string; secret: string; config: string } | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/vending/machines/${machineId}/agent-key`, { method: 'POST', cache: 'no-store' });
      const data = (await response.json().catch(() => null)) as { keyId?: string; secret?: string; config?: string; error?: string; message?: string } | null;
      if (!response.ok || !data?.secret || !data.keyId || !data.config) throw new Error(data?.error ?? data?.message ?? `Couldn’t issue a key (HTTP ${response.status}).`);
      setIssued({ keyId: data.keyId, secret: data.secret, config: data.config });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t issue a key.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(keyId: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/vending/integrations/credentials/${encodeURIComponent(keyId)}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
        throw new Error(data?.message ?? data?.error ?? `Couldn’t revoke (HTTP ${response.status}).`);
      }
      setRevoking(null);
      setReason('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t revoke.');
    } finally {
      setBusy(false);
    }
  }

  if (issued) {
    return (
      <div className="flex flex-col gap-4">
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          The secret is shown only now. Put it on the machine, then close this.
        </p>
        <CopyBlock label="1. Install (on the machine)" text={`curl -fsSL ${siteOf(issued.config)}/machine-agent/install.sh | sudo sh -s -- --kiosk ${machineCode}`} />
        <CopyBlock label="2. /etc/snack-quest-agent/config.json" text={issued.config} />
        <CopyBlock label="3. /etc/snack-quest-agent/secret" text={issued.secret} />
        <p className="text-xs text-muted-foreground">
          Motor type and curtain mode start at the usual values; confirm each lane during the bench tests. Then run{' '}
          <code>sudo systemctl start snack-quest-agent</code>.
        </p>
        <div>
          <Button
            type="button"
            onClick={() => {
              setIssued(null);
              router.refresh();
            }}
          >
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">No key yet. The machine software needs one to talk to Snack Quest.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {keys.map((key) => (
            <li key={key.keyId} className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-foreground">{key.keyId}</span>
                <Badge variant={key.status === 'active' ? 'success' : 'outline'}>{key.status}</Badge>
                <Badge variant="outline">{key.environment}</Badge>
                <span className="text-muted-foreground">
                  Issued {format(key.issuedAt)} · last used {format(key.lastUsedAt)}
                </span>
              </div>
              {key.status === 'active' ? (
                revoking === key.keyId ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Label htmlFor={`revoke-${key.keyId}`}>Why revoke it</Label>
                      <Input id={`revoke-${key.keyId}`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Pi replaced" />
                    </div>
                    <Button size="sm" variant="danger" loading={busy} disabled={!reason.trim()} onClick={() => revoke(key.keyId)}>
                      Revoke
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setRevoking(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Button size="sm" variant="outline" onClick={() => setRevoking(key.keyId)}>
                      Revoke…
                    </Button>
                  </div>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="button" variant="outline" onClick={issue} loading={busy}>
          <KeyRound className="size-4" aria-hidden="true" />
          Issue machine software key
        </Button>
      </div>
    </div>
  );
}
