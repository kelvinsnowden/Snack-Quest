'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Copy, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { sendJson } from './sendJson';

export interface CredentialRow {
  keyId: string;
  kind: 'api' | 'webhook';
  environment: 'sandbox' | 'production';
  label: string;
  secretHint: string;
  status: 'issued' | 'active' | 'rotating' | 'expired' | 'revoked';
  scope: { type: 'manufacturer' } | { type: 'machine'; machineId: string; machineCode: string };
  issuedAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  graceEndsAt: string | null;
  supersededBy: string | null;
  rotatedFrom: string | null;
}

export interface ScopeableMachine {
  machineId: string;
  machineCode: string;
  environment: 'sandbox' | 'production';
}

const STATUS_BADGE: Record<CredentialRow['status'], { label: string; variant: 'success' | 'secondary' | 'warning' | 'outline' }> = {
  issued: { label: 'Issued · not yet used', variant: 'secondary' },
  active: { label: 'Active', variant: 'success' },
  rotating: { label: 'Rotating out', variant: 'warning' },
  expired: { label: 'Expired', variant: 'outline' },
  revoked: { label: 'Revoked', variant: 'outline' },
};

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

/**
 * Signing credentials for one manufacturer. A new secret is shown here
 * once and never again — it is stored encrypted and no route returns it.
 * Rotate issues a successor and keeps the old key working for a grace
 * period (7 days by default) so the fleet can move over without an
 * outage; revoke it early once "Last used" shows nothing still uses it.
 */
export function CredentialsPanel({
  manufacturerId,
  credentials,
  canIssueProduction,
  machines = [],
}: {
  manufacturerId: string;
  credentials: CredentialRow[];
  canIssueProduction: boolean;
  machines?: ScopeableMachine[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<'api' | 'webhook'>('api');
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [label, setLabel] = useState('');
  const [machineId, setMachineId] = useState('');
  const [issued, setIssued] = useState<{ keyId: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function issue(event: React.FormEvent) {
    event.preventDefault();
    setBusy('issue');
    setError(null);
    setIssued(null);
    try {
      const { credential } = await sendJson<{ credential: { keyId: string; secret: string } }>(`/api/vending/integrations/manufacturers/${manufacturerId}/credentials`, 'POST', { kind, environment, label, ...(machineId ? { machineId } : {}) });
      setIssued(credential);
      setCopied(false);
      setLabel('');
      setMachineId('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not issue the credential.');
    } finally {
      setBusy(null);
    }
  }

  async function rotate(keyId: string) {
    if (!window.confirm(`Rotate ${keyId}? A new key is issued now; the old one keeps working for 7 days so the fleet can switch over.`)) return;
    setBusy(keyId);
    setError(null);
    setIssued(null);
    try {
      const { credential } = await sendJson<{ credential: { keyId: string; secret: string } }>(`/api/vending/integrations/credentials/${encodeURIComponent(keyId)}/rotate`, 'POST', {});
      setIssued(credential);
      setCopied(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rotate the credential.');
    } finally {
      setBusy(null);
    }
  }

  async function revoke(keyId: string) {
    const reason = window.prompt(`Revoke ${keyId}? Requests signed with it are rejected within 30 seconds. Reason:`);
    if (!reason) return;
    setBusy(keyId);
    setError(null);
    try {
      await sendJson(`/api/vending/integrations/credentials/${encodeURIComponent(keyId)}/revoke`, 'POST', { reason });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke the credential.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {issued ? (
        <div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-4" role="status">
          <p className="flex items-center gap-2 text-sm font-medium text-warning">
            <AlertTriangle className="size-4" aria-hidden="true" />
            Copy this secret now. It will not be shown again.
          </p>
          <p className="text-sm"><span className="text-muted-foreground">Key id:</span> <code className="font-mono">{issued.keyId}</code></p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-surface px-2 py-1 font-mono text-sm">{issued.secret}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(issued.secret);
                setCopied(true);
              }}
            >
              <Copy className="size-4" aria-hidden="true" />
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="text-caption text-muted-foreground">Send it to the manufacturer over a channel you trust, separately from the key id.</p>
        </div>
      ) : null}

      <form onSubmit={issue} className="grid gap-4 md:grid-cols-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="cred-kind">Used for</Label>
          <select id="cred-kind" className="h-11 md:h-10 rounded-md border border-border bg-surface px-3 text-base sm:text-sm" value={kind} onChange={(event) => setKind(event.target.value as 'api' | 'webhook')}>
            <option value="api">Machine API requests</option>
            <option value="webhook">Webhook deliveries</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cred-env">Environment</Label>
          <select id="cred-env" className="h-11 md:h-10 rounded-md border border-border bg-surface px-3 text-base sm:text-sm" value={environment} onChange={(event) => setEnvironment(event.target.value as 'sandbox' | 'production')}>
            <option value="sandbox">Sandbox</option>
            <option value="production" disabled={!canIssueProduction}>Production{canIssueProduction ? '' : ' (after certification)'}</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cred-label">Label</Label>
          <Input id="cred-label" placeholder="e.g. Firmware fleet key" value={label} onChange={(event) => setLabel(event.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cred-scope">Speaks for</Label>
          <select id="cred-scope" className="h-11 md:h-10 rounded-md border border-border bg-surface px-3 text-base sm:text-sm" value={machineId} disabled={kind !== 'api'} onChange={(event) => setMachineId(event.target.value)}>
            <option value="">All machines (manufacturer cloud)</option>
            {machines
              .filter((machine) => machine.environment === environment)
              .map((machine) => (
                <option key={machine.machineId} value={machine.machineId}>
                  Only {machine.machineCode}
                </option>
              ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" size="sm" loading={busy === 'issue'}>
            <KeyRound className="size-4" aria-hidden="true" />
            Issue credential
          </Button>
        </div>
      </form>
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}

      {credentials.length === 0 ? (
        <p className="text-sm text-muted-foreground">No credentials issued yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Key id</th>
                <th className="py-2 pr-4 font-medium">Use</th>
                <th className="py-2 pr-4 font-medium">Issued</th>
                <th className="py-2 pr-4 font-medium">Last used</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {credentials.map((credential) => (
                <tr key={credential.keyId} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4">
                    <code className="font-mono text-xs">{credential.keyId}</code>
                    <div className="text-caption text-muted-foreground">
                      {credential.label} · {credential.secretHint}
                      {credential.scope.type === 'machine' ? ` · only ${credential.scope.machineCode}` : ''}
                      {credential.rotatedFrom ? ` · replaces ${credential.rotatedFrom}` : ''}
                    </div>
                  </td>
                  <td className="py-2 pr-4">
                    <Badge variant="outline">{credential.kind === 'api' ? 'API' : 'Webhook'}</Badge>{' '}
                    <Badge variant={credential.environment === 'production' ? 'danger' : 'secondary'}>{credential.environment}</Badge>
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{formatDate(credential.issuedAt)}</td>
                  <td className="py-2 pr-4 tabular-nums">{formatDate(credential.lastUsedAt)}</td>
                  <td className="py-2 pr-4">
                    <Badge variant={STATUS_BADGE[credential.status].variant} title={credential.revokedReason ?? undefined}>
                      {STATUS_BADGE[credential.status].label}
                    </Badge>
                    {credential.status === 'rotating' && credential.graceEndsAt ? (
                      <div className="text-caption text-muted-foreground">works until {formatDate(credential.graceEndsAt)}</div>
                    ) : null}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {credential.status === 'issued' || credential.status === 'active' ? (
                      <Button size="sm" variant="ghost" loading={busy === credential.keyId} onClick={() => rotate(credential.keyId)}>
                        Rotate
                      </Button>
                    ) : null}
                    {credential.status !== 'revoked' && credential.status !== 'expired' ? (
                      <Button size="sm" variant="ghost" loading={busy === credential.keyId} onClick={() => revoke(credential.keyId)}>
                        Revoke
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
