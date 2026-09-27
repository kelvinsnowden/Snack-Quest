'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, PlugZap, Power, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { IntegrationHealthState, MachineIntegrationState, ModelCertificationStatus } from '@/types';
import { CertificationBadge, IntegrationHealthBadge, IntegrationStateBadge } from './IntegrationBadges';
import { sendJson } from './sendJson';

export interface IntegrationPanelView {
  integration: {
    state: MachineIntegrationState;
    environment: 'sandbox' | 'production';
    manufacturerId: string;
    modelId: string;
    manufacturerMachineId: string;
    adapterKey: string;
    controllerType: string | null;
    controllerVersion: string | null;
    firmwareVersion: string | null;
    integrationVersion: string | null;
    lastConnectionTest: { at: string; ok: boolean; detail: string; latencyMs: number | null } | null;
    activatedAt: string | null;
    suspendedReason: string | null;
    signals: Record<'heartbeat' | 'api_request' | 'dispense_success' | 'inventory_sync' | 'webhook', string | null>;
    errorCounts: Record<'connection' | 'authentication' | 'timeout' | 'protocol', number>;
    lastError: { kind: string; message: string; at: string } | null;
  } | null;
  manufacturer: { id: string; name: string } | null;
  model: { id: string; name: string; certificationStatus: ModelCertificationStatus } | null;
  adapter: { key: string; label: string; direction: string; environment: string; maturity: string } | null;
  health: { state: IntegrationHealthState; reason: string } | null;
  activationBlockers: string[];
}

export interface PanelOption {
  manufacturers: { id: string; name: string }[];
  models: { id: string; manufacturerId: string; name: string }[];
}

export interface PanelEvent {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  occurredAt: string;
  source: string;
  slotCode: string | null;
  nativeType: string | null;
}

export interface PanelDispenseCommand {
  commandRef: string;
  status: string;
  slotCode: string;
  manufacturerSlotId: string | null;
  delivery: string | null;
  failureReason: string | null;
  updatedAt: string;
}

const SIGNAL_LABELS: Record<string, string> = {
  heartbeat: 'Last heartbeat',
  api_request: 'Last API request',
  dispense_success: 'Last successful dispense',
  inventory_sync: 'Last inventory sync',
  webhook: 'Last webhook',
};

const SEVERITY_VARIANT = { info: 'outline', warning: 'warning', critical: 'danger' } as const;

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

/**
 * The Integration card on the admin machine page (§ MACHINE DETAIL PAGE
 * → Integration, admin-only; § ADMIN CONSOLE: CONFIGURE → TEST →
 * ACTIVATE). Everything here is infrastructure the owner portal never
 * shows.
 */
export function MachineIntegrationPanel({
  machineId,
  view,
  options,
  slots,
  events,
  dispenseCommands,
}: {
  machineId: string;
  view: IntegrationPanelView;
  options: PanelOption;
  slots: { slotCode: string; manufacturerSlotId: string | null }[];
  events: PanelEvent[];
  dispenseCommands: PanelDispenseCommand[];
}) {
  const router = useRouter();
  const integration = view.integration;
  const [configuring, setConfiguring] = useState(!integration);
  const [manufacturerId, setManufacturerId] = useState(integration?.manufacturerId ?? options.manufacturers[0]?.id ?? '');
  const modelsForManufacturer = options.models.filter((model) => model.manufacturerId === manufacturerId);
  const [modelId, setModelId] = useState(integration?.modelId ?? '');
  const [manufacturerMachineId, setManufacturerMachineId] = useState(integration?.manufacturerMachineId ?? '');
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>(integration?.environment ?? 'sandbox');
  const [controllerType, setControllerType] = useState(integration?.controllerType ?? '');
  const [controllerVersion, setControllerVersion] = useState(integration?.controllerVersion ?? '');
  const [mappings, setMappings] = useState(Object.fromEntries(slots.map((slot) => [slot.slotCode, slot.manufacturerSlotId ?? ''])));
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const effectiveModelId = modelsForManufacturer.some((model) => model.id === modelId) ? modelId : (modelsForManufacturer[0]?.id ?? '');

  async function run(label: string, action: () => Promise<string | void>) {
    setBusy(label);
    setMessage(null);
    try {
      const note = await action();
      if (note) setMessage({ tone: 'ok', text: note });
      router.refresh();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Refused.' });
    } finally {
      setBusy(null);
    }
  }

  const configure = () =>
    run('configure', async () => {
      await sendJson(`/api/vending/machines/${machineId}/integration`, 'PUT', {
        manufacturerId,
        modelId: effectiveModelId,
        manufacturerMachineId,
        environment,
        controllerType: controllerType || null,
        controllerVersion: controllerVersion || null,
      });
      setConfiguring(false);
      return 'Configured. Run a connection test next.';
    });

  return (
    <div className="flex flex-col gap-6">
      {integration ? (
        <div className="flex flex-wrap items-center gap-2">
          <IntegrationStateBadge state={integration.state} />
          {view.health ? <IntegrationHealthBadge state={view.health.state} /> : null}
          <Badge variant={integration.environment === 'production' ? 'danger' : 'secondary'}>{integration.environment}</Badge>
          {view.health ? <span className="text-sm text-muted-foreground">{view.health.reason}</span> : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Not in the manufacturer registry yet — this machine still dispenses through its adapter directly. Configuring an integration puts it behind the CONFIGURE → TEST → ACTIVATE gate.
        </p>
      )}

      {integration && !configuring ? (
        <>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Manufacturer">{view.manufacturer?.name ?? integration.manufacturerId}</Field>
            <Field label="Model">
              <span className="flex items-center gap-2">
                {view.model?.name ?? integration.modelId}
                {view.model ? <CertificationBadge status={view.model.certificationStatus} /> : null}
              </span>
            </Field>
            <Field label="Adapter">
              {view.adapter ? `${view.adapter.label} (${view.adapter.direction}, ${view.adapter.maturity})` : integration.adapterKey}
            </Field>
            <Field label="Manufacturer machine id"><code className="font-mono text-xs">{integration.manufacturerMachineId}</code></Field>
            <Field label="Controller">{[integration.controllerType, integration.controllerVersion].filter(Boolean).join(' ') || '—'}</Field>
            <Field label="Firmware">{integration.firmwareVersion ?? '—'}</Field>
            <Field label="Contract version">{integration.integrationVersion ?? '—'}</Field>
            <Field label="Activated">{when(integration.activatedAt)}</Field>
          </dl>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-md border border-border p-4">
              <h3 className="mb-3 text-sm font-medium">Signals</h3>
              <dl className="grid gap-3 sm:grid-cols-2">
                {Object.entries(SIGNAL_LABELS).map(([key, label]) => (
                  <Field key={key} label={label}><span className="tabular-nums">{when(integration.signals[key as keyof typeof integration.signals])}</span></Field>
                ))}
                <Field label="Last connection test">
                  {integration.lastConnectionTest ? (
                    <span className={integration.lastConnectionTest.ok ? 'text-success' : 'text-danger'}>
                      {integration.lastConnectionTest.ok ? 'Passed' : 'Failed'} · {when(integration.lastConnectionTest.at)}
                    </span>
                  ) : (
                    'Never run'
                  )}
                </Field>
              </dl>
            </div>
            <div className="rounded-md border border-border p-4">
              <h3 className="mb-3 text-sm font-medium">Errors since configured</h3>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(['connection', 'authentication', 'timeout', 'protocol'] as const).map((kind) => (
                  <Field key={kind} label={kind[0].toUpperCase() + kind.slice(1)}>
                    <span className={`tabular-nums ${integration.errorCounts[kind] > 0 ? 'text-warning' : ''}`}>{integration.errorCounts[kind]}</span>
                  </Field>
                ))}
              </dl>
              {integration.lastError ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Last: <span className="text-foreground">{integration.lastError.kind}</span> — {integration.lastError.message} ({when(integration.lastError.at)})
                </p>
              ) : null}
            </div>
          </div>

          {integration.lastConnectionTest && !integration.lastConnectionTest.ok ? (
            <p className="text-sm text-danger">Connection test: {integration.lastConnectionTest.detail}</p>
          ) : null}
          {integration.state === 'suspended' && integration.suspendedReason ? <p className="text-sm text-warning">Suspended: {integration.suspendedReason}</p> : null}

          {view.activationBlockers.length > 0 && integration.state !== 'active' ? (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3">
              <p className="mb-1 flex items-center gap-2 text-sm font-medium text-warning">
                <AlertTriangle className="size-4" aria-hidden="true" />
                Activation is blocked
              </p>
              <ul className="list-disc pl-6 text-sm text-foreground">
                {view.activationBlockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              loading={busy === 'test'}
              disabled={busy !== null}
              onClick={() =>
                run('test', async () => {
                  const result = await sendJson<{ ok: boolean; detail: string }>(`/api/vending/machines/${machineId}/integration/test`, 'POST');
                  return `${result.ok ? 'Passed' : 'Failed'}: ${result.detail}`;
                })
              }
            >
              <PlugZap className="size-4" aria-hidden="true" />
              Test connection
            </Button>
            {integration.state !== 'active' ? (
              <Button size="sm" loading={busy === 'activate'} disabled={busy !== null || integration.state !== 'tested'} onClick={() => run('activate', async () => { await sendJson(`/api/vending/machines/${machineId}/integration/activate`, 'POST'); return 'Active — this machine can now dispense.'; })}>
                <ShieldCheck className="size-4" aria-hidden="true" />
                Activate
              </Button>
            ) : null}
            {integration.state !== 'suspended' ? (
              <Button
                size="sm"
                variant="outline"
                loading={busy === 'suspend'}
                disabled={busy !== null}
                onClick={() => {
                  const reason = window.prompt('Suspend dispensing on this machine. Reason:');
                  if (reason) void run('suspend', async () => { await sendJson(`/api/vending/machines/${machineId}/integration/suspend`, 'POST', { reason }); });
                }}
              >
                <Power className="size-4" aria-hidden="true" />
                Suspend
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setConfiguring(true)}>
              Reconfigure
            </Button>
          </div>
        </>
      ) : null}

      {configuring ? (
        <div className="flex flex-col gap-4 rounded-md border border-border p-4">
          <h3 className="text-sm font-medium">{integration ? 'Reconfigure integration' : 'Configure integration'}</h3>
          {integration ? <p className="text-caption text-muted-foreground">Saving drops the integration back to “configured” — it must be tested and activated again.</p> : null}
          {options.manufacturers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add a manufacturer and model under Machine Integrations first.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="int-mfr">Manufacturer</Label>
                <select id="int-mfr" className="h-11 md:h-10 rounded-md border border-border bg-surface px-3 text-base sm:text-sm" value={manufacturerId} onChange={(event) => setManufacturerId(event.target.value)}>
                  {options.manufacturers.map((manufacturer) => (
                    <option key={manufacturer.id} value={manufacturer.id}>{manufacturer.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="int-model">Model</Label>
                <select id="int-model" className="h-11 md:h-10 rounded-md border border-border bg-surface px-3 text-base sm:text-sm" value={effectiveModelId} onChange={(event) => setModelId(event.target.value)}>
                  {modelsForManufacturer.map((model) => (
                    <option key={model.id} value={model.id}>{model.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="int-env">Environment</Label>
                <select id="int-env" className="h-11 md:h-10 rounded-md border border-border bg-surface px-3 text-base sm:text-sm" value={environment} onChange={(event) => setEnvironment(event.target.value as 'sandbox' | 'production')}>
                  <option value="sandbox">Sandbox (testing, certification)</option>
                  <option value="production">Production (real customers)</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="int-mid">Manufacturer machine id</Label>
                <Input id="int-mid" value={manufacturerMachineId} onChange={(event) => setManufacturerMachineId(event.target.value)} placeholder="Their id for this unit" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="int-ctrl">Controller (optional)</Label>
                <Input id="int-ctrl" value={controllerType} onChange={(event) => setControllerType(event.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="int-ctrl-v">Controller version (optional)</Label>
                <Input id="int-ctrl-v" value={controllerVersion} onChange={(event) => setControllerVersion(event.target.value)} />
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" loading={busy === 'configure'} disabled={!manufacturerId || !effectiveModelId || !manufacturerMachineId.trim()} onClick={configure}>
              Save configuration
            </Button>
            {integration ? <Button size="sm" variant="ghost" onClick={() => setConfiguring(false)}>Cancel</Button> : null}
          </div>
        </div>
      ) : null}

      {message ? <p className={`text-sm ${message.tone === 'error' ? 'text-danger' : 'text-success'}`} role="status">{message.text}</p> : null}

      {slots.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Slot mapping</h3>
          <p className="text-caption text-muted-foreground">What the manufacturer calls each slot. Leave blank if they use the Snack Quest code.</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {slots.map((slot) => (
              <label key={slot.slotCode} className="flex items-center gap-2 text-sm">
                <span className="w-14 shrink-0 font-mono">{slot.slotCode}</span>
                <Input value={mappings[slot.slotCode] ?? ''} placeholder={slot.slotCode} onChange={(event) => setMappings((current) => ({ ...current, [slot.slotCode]: event.target.value }))} />
              </label>
            ))}
          </div>
          <div>
            <Button
              size="sm"
              variant="outline"
              loading={busy === 'mapping'}
              onClick={() =>
                run('mapping', async () => {
                  await sendJson(`/api/vending/machines/${machineId}/slot-mapping`, 'PUT', {
                    mappings: slots.map((slot) => ({ slotCode: slot.slotCode, manufacturerSlotId: mappings[slot.slotCode]?.trim() || null })),
                  });
                  return 'Slot mapping saved.';
                })
              }
            >
              Save slot mapping
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Recent machine events</h3>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-b border-border last:border-0">
                      <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">{when(event.occurredAt)}</td>
                      <td className="py-1.5 pr-3"><Badge variant={SEVERITY_VARIANT[event.severity]}>{event.type}</Badge></td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{[event.slotCode, event.nativeType && event.nativeType !== event.type ? event.nativeType : null].filter(Boolean).join(' · ')}</td>
                      <td className="py-1.5 text-caption text-muted-foreground">{event.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Dispense commands</h3>
          {dispenseCommands.length === 0 ? (
            <p className="text-sm text-muted-foreground">No dispenses yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {dispenseCommands.map((command) => (
                    <tr key={command.commandRef} className="border-b border-border last:border-0">
                      <td className="py-1.5 pr-3 font-mono text-xs">{command.commandRef}</td>
                      <td className="py-1.5 pr-3">
                        <Badge variant={command.status === 'dispensed' ? 'success' : ['failed', 'rejected', 'unknown', 'timeout'].includes(command.status) ? 'warning' : 'outline'}>{command.status}</Badge>
                      </td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{command.slotCode}{command.manufacturerSlotId && command.manufacturerSlotId !== command.slotCode ? ` → ${command.manufacturerSlotId}` : ''}</td>
                      <td className="py-1.5 text-caption text-muted-foreground" title={command.failureReason ?? undefined}>{when(command.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
