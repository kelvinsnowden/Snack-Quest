import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { machineService } from '@/services/machineService';
import { locationService } from '@/services/locationService';
import { machineLocationHistoryRepository } from '@/repositories/machineLocationHistoryRepository';
import { BUSINESS_TIME_ZONE } from '@/lib/vending/businessClock';
import { MACHINE_STATUS_TRANSITIONS } from '@/types';
import { auditLogRepository } from '@/repositories/auditLogRepository';
import { actorNamesFor } from '@/lib/audit/actorNames';
import { EntityHistory } from '@/components/admin/EntityHistory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MachineStatusControl, MachineMoveControl } from '@/components/admin/vending/MachineStatusControls';
import { MachineOwnerControl } from '@/components/admin/vending/OwnerControls';
import { DeviceKeysCard } from '@/components/admin/vending/DeviceKeysCard';
import { SubscriptionCard } from '@/components/admin/vending/SubscriptionCard';
import { machineSubscriptionService } from '@/services/machineSubscriptionService';
import { deviceCredentialRepository } from '@/repositories/deviceCredentialRepository';
import { partnerService } from '@/services/partnerService';
import { machineOwnershipHistoryRepository } from '@/repositories/machineOwnershipHistoryRepository';
import { partnerMachineAgreementRepository } from '@/repositories/partnerMachineAgreementRepository';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { machineCoolingService } from '@/services/machineCoolingService';
import { CoolingCard } from '@/components/admin/vending/CoolingCard';
import { AgentKeyCard } from '@/components/admin/vending/AgentKeyCard';
import { machineAgentKeyService } from '@/services/machineAgentKeyService';
import { TemperatureChart } from '@/components/admin/vending/TemperatureChart';
import { temperatureRecord } from '@/services/machineTemperatureService';
import { DEFAULT_COOLING, effectiveCooling, judgeTemperature } from '@/lib/vending/cooling';

export const metadata: Metadata = { title: 'Machine setup' };

const day = new Intl.DateTimeFormat('en-KE', { timeZone: BUSINESS_TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Everything about a machine that someone sets rather than watches: its
 * status, where it stands, who owns it, its screen key, its slots and what
 * it sells. Each card shows only to people with that permission.
 */
export default async function MachineSetupPage({ params }: { params: Promise<{ machineId: string }> }) {
  const session = await requireStaffSession();
  const { machineId } = await params;
  const machine = await machineService.findById(session.businessId, machineId);
  if (!machine) notFound();
  const canSeeOwners = hasPermission(session, 'owners.view');
  const canManageKeys = hasPermission(session, 'machines.credentials.manage');
  const canSeeMoney = hasPermission(session, 'owner_finance.view');
  const [locations, history, owners, ownerHistory, activeAgreement, keys, subscription] = await Promise.all([
    locationService.listByBusiness(session.businessId),
    machineLocationHistoryRepository.listByMachine(session.businessId, machineId),
    canSeeOwners ? partnerService.listByBusiness(session.businessId) : Promise.resolve([]),
    canSeeOwners ? machineOwnershipHistoryRepository.listByMachine(session.businessId, machineId) : Promise.resolve([]),
    canSeeOwners ? partnerMachineAgreementRepository.findActiveForMachine(session.businessId, machineId) : Promise.resolve(null),
    canManageKeys ? deviceCredentialRepository.listByMachine(session.businessId, machineId) : Promise.resolve([]),
    canSeeMoney ? machineSubscriptionService.findActiveForMachine(session.businessId, machineId) : Promise.resolve(null),
  ]);
  const [integration, canControlCooling] = await Promise.all([
    machineIntegrationRepository.findByMachineId(session.businessId, machineId),
    machineCoolingService.canControl(session.businessId, machineId),
  ]);
  const reported = integration?.lastReportedStatus ?? null;
  const canManageAgentKeys = hasPermission(session, 'integrations.credentials.manage') && integration !== null;
  const agentKeys = canManageAgentKeys ? await machineAgentKeyService.list(session.businessId, machineId) : [];
  const nowMs = new Date().getTime();
  const weekAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;
  const temperatureRows = await temperatureRecord(session.businessId, machineId, weekAgoMs, nowMs);
  const effectiveRange = effectiveCooling(machine.cooling, reported?.temperatureCelsius);
  const temperatureVerdict = judgeTemperature(
    effectiveCooling(machine.cooling, reported?.temperatureCelsius),
    reported ? { celsius: reported.temperatureCelsius, atMs: reported.reportedAt.toMillis() } : null,
    nowMs,
  ).kind;
  const iso = (value: { toDate(): Date } | null | undefined) => (value ? value.toDate().toISOString() : null);
  const names = new Map(locations.map(({ id, data }) => [id, data.name]));
  const ownerNames = new Map(owners.map(({ id, data }) => [id, data.name]));
  const auditHistory = hasPermission(session, 'audit.view') ? (await auditLogRepository.search(session.businessId, { machineId, limit: 15 })).logs : null;
  const historyNames = auditHistory ? await actorNamesFor(auditHistory) : new Map<string, string>();
  const ownerName = (partnerId: string | null) => (partnerId ? (ownerNames.get(partnerId) ?? partnerId) : 'Snack Quest');

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <Link href={`/admin/vending/${machineId}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {machine.machineCode}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Set up {machine.machineCode}</h1>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <MachineStatusControl machineId={machineId} machineCode={machine.machineCode} status={machine.status} next={(MACHINE_STATUS_TRANSITIONS[machine.status] ?? []).filter((to) => to !== 'decommissioned' || hasPermission(session, 'machines.decommission'))} canEdit={hasPermission(session, 'machines.status.manage')} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Location</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <MachineMoveControl
              machineId={machineId}
              currentLocationId={machine.locationId ?? null}
              locations={[...locations].sort((a, b) => a.data.name.localeCompare(b.data.name)).map(({ id, data }) => ({ id, name: data.name }))}
              canEdit={hasPermission(session, 'machines.relocate')}
            />
            {history.length > 0 ? (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">History</p>
                <ul className="flex flex-col gap-1 text-sm">
                  {history.map((entry, index) => (
                    <li key={index} className="text-muted-foreground">
                      <span className="text-foreground">{(entry.locationId && names.get(entry.locationId)) ?? entry.venueName ?? 'No location'}</span>
                      {' · '}
                      {day.format(entry.effectiveFrom.toDate())} – {entry.effectiveTo ? day.format(entry.effectiveTo.toDate()) : 'now'}
                      {entry.reason ? ` · ${entry.reason}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card id="cooling" className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="text-base">Cooling</CardTitle>
          </CardHeader>
          <CardContent>
            <CoolingCard
              machineId={machineId}
              cooling={machine.cooling ?? DEFAULT_COOLING}
              saved={Boolean(machine.cooling)}
              reading={reported ? { celsius: reported.temperatureCelsius, at: reported.reportedAt.toDate().toISOString() } : null}
              verdict={temperatureVerdict}
              canEdit={hasPermission(session, 'machines.commands.issue')}
              canControl={canControlCooling}
            />
            <div className="mt-6 flex flex-col gap-3 border-t border-border pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">Last 7 days</p>
                <a href={`/api/vending/machines/${machineId}/temperature-log`} className="text-sm font-medium text-primary hover:underline">
                  Download record (CSV, 30 days)
                </a>
              </div>
              <TemperatureChart rows={temperatureRows} fromMs={weekAgoMs} toMs={nowMs} target={effectiveRange?.enabled ? effectiveRange : null} />
            </div>
          </CardContent>
        </Card>

        {canManageAgentKeys ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Machine software key</CardTitle>
            </CardHeader>
            <CardContent>
              <AgentKeyCard
                machineId={machineId}
                machineCode={machine.machineCode}
                keys={agentKeys.map((key) => ({
                  keyId: key.keyId,
                  environment: key.environment,
                  status: key.status,
                  issuedAt: key.issuedAt ? key.issuedAt.toDate().toISOString() : null,
                  lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toDate().toISOString() : null,
                }))}
              />
            </CardContent>
          </Card>
        ) : null}

        {canManageKeys ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Screen keys</CardTitle>
            </CardHeader>
            <CardContent>
              <DeviceKeysCard
                machineId={machineId}
                machineCode={machine.machineCode}
                keys={keys.map(({ id, data }) => ({
                  id,
                  prefix: data.secretPrefix,
                  issuedAt: data.issuedAt ? data.issuedAt.toDate().toISOString() : null,
                  lastUsedAt: data.lastUsedAt ? data.lastUsedAt.toDate().toISOString() : null,
                  revokedAt: data.revokedAt ? data.revokedAt.toDate().toISOString() : null,
                  revokedReason: data.revokedReason,
                }))}
              />
            </CardContent>
          </Card>
        ) : null}

        {canSeeMoney ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Owner subscription</CardTitle>
            </CardHeader>
            <CardContent>
              <SubscriptionCard
                machineId={machineId}
                ownerId={machine.ownerPartnerId ?? null}
                ownerName={machine.ownerPartnerId ? ownerName(machine.ownerPartnerId) : null}
                subscription={
                  subscription
                    ? {
                        id: subscription.id,
                        planName: subscription.data.planName,
                        amountKes: subscription.data.amountKes,
                        frequency: subscription.data.frequency,
                        status: subscription.data.status,
                        currentPeriodStart: iso(subscription.data.currentPeriodStart)!,
                        currentPeriodEnd: iso(subscription.data.currentPeriodEnd)!,
                        lastPaymentStatus: subscription.data.lastPaymentStatus,
                        lastPaidAt: iso(subscription.data.lastPaidAt),
                        arrearsKes: subscription.data.arrearsKes,
                        graceUntil: iso(subscription.data.graceUntil),
                      }
                    : null
                }
                canManage={hasPermission(session, 'owner_finance.subscriptions.manage')}
              />
            </CardContent>
          </Card>
        ) : null}

        {canSeeOwners ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Owner</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-foreground">
                Owned by{' '}
                {machine.ownerPartnerId ? (
                  <Link href={`/admin/vending/partners/${machine.ownerPartnerId}`} className="font-semibold hover:underline">
                    {ownerName(machine.ownerPartnerId)}
                  </Link>
                ) : (
                  <span className="font-semibold">Snack Quest</span>
                )}
                {activeAgreement ? ` · agreement active${activeAgreement.data.revenueSharePartnerPct !== null ? ` (${activeAgreement.data.revenueSharePartnerPct}% to owner)` : ''}` : machine.ownerPartnerId ? ' · no active agreement' : ''}
              </p>
              {hasPermission(session, 'owners.manage') ? (
                <MachineOwnerControl
                  machineId={machineId}
                  currentOwnerId={machine.ownerPartnerId ?? null}
                  owners={[...owners].sort((a, b) => a.data.name.localeCompare(b.data.name)).map(({ id, data }) => ({ id, name: data.name, status: data.status }))}
                  hasActiveAgreement={activeAgreement !== null}
                />
              ) : null}
              {ownerHistory.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">History</p>
                  <ul className="flex flex-col gap-1 text-sm">
                    {ownerHistory.map((entry, index) => (
                      <li key={index} className="text-muted-foreground">
                        <span className="text-foreground">{ownerName(entry.partnerId)}</span>
                        {' · '}
                        {day.format(entry.effectiveFrom.toDate())} – {entry.effectiveTo ? day.format(entry.effectiveTo.toDate()) : 'now'}
                        {entry.reason ? ` · ${entry.reason}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {auditHistory ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
          </CardHeader>
          <CardContent>
            <EntityHistory logs={auditHistory} actorNames={historyNames} moreHref={`/admin/audit-logs?machine=${encodeURIComponent(machine.machineCode)}`} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
