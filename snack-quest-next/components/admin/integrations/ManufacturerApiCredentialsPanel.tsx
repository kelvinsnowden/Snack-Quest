'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { sendJson } from './sendJson';

export interface ApiCredentialRow {
  environment: 'sandbox' | 'production';
  baseUrl: string;
  status: 'active' | 'revoked';
  current: { version: number; fingerprint: string; setAt: string; setBy: string } | null;
  previous: { version: number; fingerprint: string; retiredAt: string } | null;
  revokedAt: string | null;
  revokedReason: string | null;
  updatedAt: string;
  updatedBy: string;
}

const ENVIRONMENTS = ['sandbox', 'production'] as const;

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

/**
 * The key Snack Quest uses to call this manufacturer's API, per
 * environment. Write-only: a key typed here is encrypted on the server
 * and never shown again, anywhere — only its fingerprint, so two people
 * can confirm they hold the same one. Setting a new key keeps the old one
 * for roll-back until the next rotation.
 */
export function ManufacturerApiCredentialsPanel({ manufacturerId, credentials }: { manufacturerId: string; credentials: ApiCredentialRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<'sandbox' | 'production' | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const byEnvironment = new Map(credentials.map((credential) => [credential.environment, credential]));
  const base = `/api/vending/integrations/manufacturers/${manufacturerId}/api-credentials`;

  function startEditing(environment: 'sandbox' | 'production') {
    setEditing(environment);
    setBaseUrl(byEnvironment.get(environment)?.baseUrl ?? '');
    setApiKey('');
    setError(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy('save');
    setError(null);
    try {
      await sendJson(`${base}/${editing}`, 'PUT', { baseUrl, ...(apiKey ? { apiKey } : {}) });
      setApiKey('');
      setEditing(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the credential.');
    } finally {
      setBusy(null);
    }
  }

  async function rollBack(environment: string) {
    if (!window.confirm(`Put the previous ${environment} key back? The current one is discarded.`)) return;
    setBusy(`rollback-${environment}`);
    setError(null);
    try {
      await sendJson(`${base}/${environment}/rollback`, 'POST', {});
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not roll back.');
    } finally {
      setBusy(null);
    }
  }

  async function revoke(environment: string) {
    const reason = window.prompt(`Revoke the ${environment} key? Every call to this manufacturer in ${environment} stops, and payments for its machines are declined, until a new key is set. Reason:`);
    if (!reason) return;
    setBusy(`revoke-${environment}`);
    setError(null);
    try {
      await sendJson(`${base}/${environment}/revoke`, 'POST', { reason });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke the credential.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Only needed when Snack Quest calls this manufacturer&rsquo;s API. Keys are stored encrypted and never displayed again — compare fingerprints to check which key is in use.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Environment</th>
              <th className="py-2 pr-4 font-medium">Base URL</th>
              <th className="py-2 pr-4 font-medium">Key</th>
              <th className="py-2 pr-4 font-medium">Set</th>
              <th className="py-2 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {ENVIRONMENTS.map((environment) => {
              const credential = byEnvironment.get(environment);
              return (
                <tr key={environment} className="border-b border-border last:border-0 align-top">
                  <td className="py-3 pr-4 capitalize">{environment}</td>
                  <td className="py-3 pr-4">{credential ? <code className="break-all font-mono text-xs">{credential.baseUrl}</code> : <span className="text-muted-foreground">Not configured</span>}</td>
                  <td className="py-3 pr-4">
                    {credential?.current ? (
                      <div className="flex flex-col gap-1">
                        <span><Badge variant="success">v{credential.current.version}</Badge> <code className="font-mono text-xs">{credential.current.fingerprint}</code></span>
                        {credential.previous ? <span className="text-caption text-muted-foreground">Previous v{credential.previous.version} ({credential.previous.fingerprint}) kept for roll-back</span> : null}
                      </div>
                    ) : credential?.status === 'revoked' ? (
                      <span className="flex flex-col gap-1"><Badge variant="outline">Revoked</Badge><span className="text-caption text-muted-foreground">{credential.revokedReason}</span></span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">{credential ? `${formatDate(credential.updatedAt)} · ${credential.updatedBy}` : '—'}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => startEditing(environment)}>
                        <KeyRound className="size-4" aria-hidden="true" />
                        {credential?.current ? 'Rotate / edit' : 'Set key'}
                      </Button>
                      {credential?.previous ? (
                        <Button size="sm" variant="ghost" loading={busy === `rollback-${environment}`} onClick={() => rollBack(environment)}>
                          <RotateCcw className="size-4" aria-hidden="true" />
                          Roll back
                        </Button>
                      ) : null}
                      {credential?.current ? (
                        <Button size="sm" variant="ghost" loading={busy === `revoke-${environment}`} onClick={() => revoke(environment)}>
                          Revoke
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing ? (
        <form onSubmit={save} className="grid gap-4 rounded-md border border-border p-4 md:grid-cols-3" autoComplete="off">
          <div className="flex flex-col gap-2">
            <Label htmlFor="api-base-url">{editing === 'sandbox' ? 'Sandbox' : 'Production'} base URL</Label>
            <Input id="api-base-url" type="url" required placeholder="https://api.manufacturer.example" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="api-key">API key {byEnvironment.get(editing)?.current ? '(leave blank to keep the current one)' : ''}</Label>
            <Input id="api-key" type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" size="sm" loading={busy === 'save'}>Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </form>
      ) : null}
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
    </div>
  );
}
