import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { manufacturerRegistryService } from '@/services/manufacturerRegistryService';
import { machineIntegrationService } from '@/services/machineIntegrationService';
import { machineReliabilityService } from '@/services/machineReliabilityService';
import { listAdapterRegistrations } from '@/lib/vending/adapterRegistry';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreateManufacturerForm } from '@/components/admin/integrations/CreateManufacturerForm';
import { IntegrationHealthBadge, IntegrationStateBadge, StageBadge } from '@/components/admin/integrations/IntegrationBadges';
import { INTEGRATION_TYPES, type IntegrationHealthState } from '@/types';
import type { ReliabilityRow } from '@/lib/vending/reliability';

export const metadata: Metadata = { title: 'Machine Integrations' };

const CONNECTS: Record<string, string> = {
  snack_quest_api: 'Our Machine API',
  manufacturer_api: 'Their API',
  sdk: 'Their SDK',
  webhook: 'Their webhooks',
  hybrid: 'Hybrid',
};

function percent(rate: number | null): string {
  return rate === null ? '—' : `${(rate * 100).toFixed(1)}%`;
}

function when(date: Date | null): string {
  return date ? date.toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function ReliabilityTable({ rows, caption }: { rows: ReliabilityRow[]; caption: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="mb-2 text-left text-sm font-medium text-foreground">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Name</th>
            <th className="py-2 pr-4 text-right font-medium">Machines</th>
            <th className="py-2 pr-4 text-right font-medium">Dispenses</th>
            <th className="py-2 pr-4 text-right font-medium">Success</th>
            <th className="py-2 pr-4 font-medium">Top failure reasons</th>
            <th className="py-2 pr-4 text-right font-medium">Errors</th>
            <th className="py-2 text-right font-medium">Downtime</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-border last:border-0">
              <td className="py-2 pr-4">{row.label}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{row.machines}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{row.dispenseAttempts}</td>
              <td className={`py-2 pr-4 text-right tabular-nums ${row.successRate !== null && row.successRate < 0.95 ? 'text-warning' : ''}`}>{percent(row.successRate)}</td>
              <td className="py-2 pr-4 text-muted-foreground">
                {Object.entries(row.failuresByReason)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([reason, count]) => `${reason} ×${count}`)
                  .join(', ') || '—'}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">{row.machineErrors}</td>
              <td className="py-2 text-right tabular-nums">{row.downtimeMinutes > 0 ? `${row.downtimeMinutes} min` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The manufacturer-agnostic integration console (§ ADMIN CONSOLE,
 * § INTEGRATION HEALTH, § ANALYTICS). Everything a machine's hardware
 * relationship involves lives here and on the per-machine Integration
 * card — nowhere in the owner portal.
 */
export default async function MachineIntegrationsPage() {
  const session = await requireStaffSession();
  const [manufacturers, models, integrations, reliability] = await Promise.all([
    manufacturerRegistryService.listManufacturers(session.businessId),
    manufacturerRegistryService.listModels(session.businessId),
    machineIntegrationService.listIntegrations(session.businessId),
    machineReliabilityService.summarize(session.businessId, 30),
  ]);
  const adapters = listAdapterRegistrations();
  const manufacturerName = new Map(manufacturers.map(({ id, data }) => [id, data.name]));
  const modelName = new Map(models.map(({ id, data }) => [id, data.name]));
  const healthCounts = integrations.reduce<Record<IntegrationHealthState, number>>(
    (counts, { health }) => ({ ...counts, [health.state]: counts[health.state] + 1 }),
    { connected: 0, degraded: 0, disconnected: 0, error: 0 },
  );
  const hasReliabilityData = reliability.byManufacturer.some((row) => row.dispenseAttempts > 0 || row.machineErrors > 0 || row.offlineEvents > 0);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Machine Integrations</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Every manufacturer, model and machine connection behind the fleet. Owners never see any of this — to them every machine is simply a Snack Quest machine.
        </p>
        {hasPermission(session, 'integrations.credentials.manage') ? (
          <Link href="/admin/vending/integrations/credentials" className="mt-1 inline-block text-sm font-medium text-primary hover:underline">
            All integration keys, with expiry and last use →
          </Link>
        ) : null}
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Fleet connections</CardTitle>
          <div className="flex flex-wrap gap-2 text-sm">
            {(Object.keys(healthCounts) as IntegrationHealthState[]).map((state) => (
              <span key={state} className="flex items-center gap-1.5">
                <IntegrationHealthBadge state={state} />
                <span className="tabular-nums">{healthCounts[state]}</span>
              </span>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {integrations.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No machine has joined the registry yet. Open a machine and configure its integration to connect it.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Machine</th>
                    <th className="px-6 py-3 font-medium">Manufacturer / model</th>
                    <th className="px-6 py-3 font-medium">Environment</th>
                    <th className="px-6 py-3 font-medium">State</th>
                    <th className="px-6 py-3 font-medium">Health</th>
                    <th className="px-6 py-3 font-medium">Last contact</th>
                  </tr>
                </thead>
                <tbody>
                  {integrations.map(({ integration, health }) => (
                    <tr key={integration.machineId} className="border-b border-border last:border-0 hover:bg-border/20">
                      <td className="px-6 py-3">
                        <Link href={`/admin/vending/${integration.machineId}`} className="font-medium text-primary hover:underline">{integration.machineCode}</Link>
                      </td>
                      <td className="px-6 py-3">{manufacturerName.get(integration.manufacturerId) ?? '—'} · {modelName.get(integration.modelId) ?? '—'}</td>
                      <td className="px-6 py-3"><Badge variant={integration.environment === 'production' ? 'danger' : 'secondary'}>{integration.environment}</Badge></td>
                      <td className="px-6 py-3"><IntegrationStateBadge state={integration.state} /></td>
                      <td className="px-6 py-3" title={health.reason}><IntegrationHealthBadge state={health.state} /></td>
                      <td className="px-6 py-3 tabular-nums text-muted-foreground">{when(health.lastContactAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manufacturers</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {manufacturers.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No manufacturers registered yet. Add the first one below.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Manufacturer</th>
                    <th className="px-6 py-3 font-medium">Connects through</th>
                    <th className="px-6 py-3 font-medium">Onboarding</th>
                    <th className="px-6 py-3 text-right font-medium">Models (certified)</th>
                    <th className="px-6 py-3 text-right font-medium">Machines</th>
                  </tr>
                </thead>
                <tbody>
                  {manufacturers.map(({ id, data }) => {
                    const own = models.filter((model) => model.data.manufacturerId === id);
                    return (
                      <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                        <td className="px-6 py-3">
                          <Link href={`/admin/vending/integrations/${id}`} className="font-medium text-primary hover:underline">{data.name}</Link>
                          {data.status === 'suspended' ? <Badge variant="warning" className="ml-2">Suspended</Badge> : null}
                        </td>
                        <td className="px-6 py-3">{CONNECTS[data.integrationType] ?? data.integrationType}</td>
                        <td className="px-6 py-3"><StageBadge stage={data.onboardingStage} /></td>
                        <td className="px-6 py-3 text-right tabular-nums">{own.length} ({own.filter((model) => model.data.certificationStatus === 'certified').length})</td>
                        <td className="px-6 py-3 text-right tabular-nums">{integrations.filter(({ integration }) => integration.manufacturerId === id).length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add manufacturer</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateManufacturerForm
            adapters={adapters.map(({ key, label, integrationTypes, maturity }) => ({ key, label, integrationTypes, maturity }))}
            integrationTypes={INTEGRATION_TYPES}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hardware reliability — last {reliability.windowDays} days</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {!hasReliabilityData ? (
            <p className="text-sm text-muted-foreground">
              No dispenses, machine errors or offline periods recorded in this window. These figures are computed only from real machine events — nothing is estimated.
            </p>
          ) : (
            <>
              <ReliabilityTable rows={reliability.byManufacturer} caption="By manufacturer" />
              <ReliabilityTable rows={reliability.byModel} caption="By model" />
              {reliability.failingSlots.length > 0 ? (
                <div>
                  <h3 className="mb-2 text-sm font-medium">Slots failing most often</h3>
                  <ul className="flex flex-wrap gap-2 text-sm">
                    {reliability.failingSlots.map((slot) => (
                      <li key={`${slot.machineCode}-${slot.slotCode}`}>
                        <Badge variant="warning">{slot.machineCode} · {slot.slotCode} · {slot.failures}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adapters</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Adapter</th>
                  <th className="px-6 py-3 font-medium">Direction</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {adapters.map((adapter) => (
                  <tr key={adapter.key} className="border-b border-border last:border-0 align-top">
                    <td className="px-6 py-3">
                      <div className="font-medium">{adapter.label}</div>
                      <code className="font-mono text-caption text-muted-foreground">{adapter.key}</code>
                    </td>
                    <td className="px-6 py-3">{adapter.direction === 'inbound' ? 'Machine calls Snack Quest' : 'Snack Quest calls machine'}</td>
                    <td className="px-6 py-3">
                      <Badge variant={adapter.maturity === 'implemented' ? 'success' : adapter.maturity === 'reference' ? 'secondary' : 'warning'}>{adapter.maturity}</Badge>{' '}
                      {adapter.environment === 'sandbox_only' ? <Badge variant="outline">sandbox only</Badge> : null}
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">{adapter.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
