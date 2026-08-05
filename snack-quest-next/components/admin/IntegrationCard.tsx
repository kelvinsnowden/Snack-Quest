'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2, Lock, LockOpen } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { IntegrationStatusBadge } from './IntegrationStatusBadge';
import { IntegrationEditDialog } from './IntegrationEditDialog';
import { WhatchimpTestMessageAction } from './WhatchimpTestMessageAction';
import { INTEGRATION_PROVIDER_LABELS } from '@/lib/integrations/statusFormat';
import type { IntegrationSummary } from '@/services/integrationSettingsService';

/** One real, per-tenant integration (§ Integration Portal) — status, masked fields, Test Connection, enable/disable, and the edit dialog. */
export function IntegrationCard({ integration }: { integration: IntegrationSummary }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error: string | null } | null>(null);
  const [togglingEnabled, setTogglingEnabled] = useState(false);

  async function onTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch(`/api/admin/integrations/${integration.provider}/test`, { method: 'POST' });
      const body = (await response.json()) as { success: boolean; error: string | null };
      setTestResult(body);
      router.refresh();
    } catch {
      setTestResult({ success: false, error: 'Could not reach the server to run this test.' });
    } finally {
      setTesting(false);
    }
  }

  async function onToggleEnabled(next: boolean) {
    setTogglingEnabled(true);
    try {
      const response = await fetch(`/api/admin/integrations/${integration.provider}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (response.ok) {
        router.refresh();
      }
    } finally {
      setTogglingEnabled(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-card-title font-semibold text-foreground">
            {INTEGRATION_PROVIDER_LABELS[integration.provider] ?? integration.provider}
          </p>
          <div className="mt-1.5">
            <IntegrationStatusBadge status={integration.status} />
          </div>
        </div>
        <Switch checked={integration.enabled} onCheckedChange={onToggleEnabled} disabled={togglingEnabled} aria-label="Enabled" />
      </div>

      <dl className="flex flex-col gap-1.5">
        {integration.fields
          .filter((f) => !f.secret)
          .slice(0, 2)
          .map((field) => (
            <div key={field.key} className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd className="truncate font-medium text-foreground">{field.value ?? '—'}</dd>
            </div>
          ))}
      </dl>

      {integration.lastTestedAt ? (
        <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
          {integration.lastTestStatus === 'success' ? (
            <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
          ) : (
            <XCircle className="size-3.5 text-danger" aria-hidden="true" />
          )}
          Last tested {new Date(integration.lastTestedAt).toLocaleString()}
        </p>
      ) : null}

      {integration.secretsEncryptedAtRest !== null ? (
        <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
          {integration.secretsEncryptedAtRest ? (
            <>
              <Lock className="size-3.5 text-success" aria-hidden="true" />
              Credentials encrypted at rest
            </>
          ) : (
            <>
              <LockOpen className="size-3.5 text-warning" aria-hidden="true" />
              Credentials stored unencrypted at rest
            </>
          )}
        </p>
      ) : null}

      {testResult ? (
        <p className={`text-sm ${testResult.success ? 'text-success' : 'text-danger'}`}>
          {testResult.success ? 'Connection succeeded.' : (testResult.error ?? 'Connection failed.')}
        </p>
      ) : null}

      <div className="mt-auto flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
          Configure
        </Button>
        <Button size="sm" variant="ghost" onClick={onTest} disabled={testing || integration.status === 'missing'}>
          {testing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Test connection
        </Button>
      </div>

      {/* WhatsApp-specific: proving `sendButtons` needs a real message, which no other provider's card has an equivalent of. */}
      {integration.provider === 'whatchimp' ? (
        <WhatchimpTestMessageAction disabled={integration.status === 'missing' || !integration.enabled} />
      ) : null}

      <IntegrationEditDialog integration={integration} open={editOpen} onOpenChange={setEditOpen} />
    </Card>
  );
}
