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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  MachineStatusControl,
  MachineMoveControl,
} from '@/components/admin/vending/MachineStatusControls';
import { MachineOwnerControl } from '@/components/admin/vending/OwnerControls';
import { partnerService } from '@/services/partnerService';
import { machineOwnershipHistoryRepository } from '@/repositories/machineOwnershipHistoryRepository';
import { partnerMachineAgreementRepository } from '@/repositories/partnerMachineAgreementRepository';

export const metadata: Metadata = { title: 'Machine setup' };

const day = new Intl.DateTimeFormat('en-KE', {
  timeZone: BUSINESS_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * Everything about a machine that someone sets rather than watches: its
 * status, where it stands, who owns it, its screen key, its slots and what
 * it sells. Each card shows only to people with that permission.
 */
export default async function MachineSetupPage({
  params,
}: {
  params: Promise<{ machineId: string }>;
}) {
  const session = await requireStaffSession();
  const { machineId } = await params;
  const machine = await machineService.findById(session.businessId, machineId);
  if (!machine) notFound();
  const canSeeOwners = hasPermission(session, 'owners.view');
  const [locations, history, owners, ownerHistory, activeAgreement] =
    await Promise.all([
      locationService.listByBusiness(session.businessId),
      machineLocationHistoryRepository.listByMachine(
        session.businessId,
        machineId,
      ),
      canSeeOwners
        ? partnerService.listByBusiness(session.businessId)
        : Promise.resolve([]),
      canSeeOwners
        ? machineOwnershipHistoryRepository.listByMachine(
            session.businessId,
            machineId,
          )
        : Promise.resolve([]),
      canSeeOwners
        ? partnerMachineAgreementRepository.findActiveForMachine(
            session.businessId,
            machineId,
          )
        : Promise.resolve(null),
    ]);
  const names = new Map(locations.map(({ id, data }) => [id, data.name]));
  const ownerNames = new Map(owners.map(({ id, data }) => [id, data.name]));
  const ownerName = (partnerId: string | null) =>
    partnerId ? (ownerNames.get(partnerId) ?? partnerId) : 'Snack Quest';

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <Link
          href={`/admin/vending/${machineId}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {machine.machineCode}
        </Link>
        <h1 className="text-foreground mt-2 text-2xl font-semibold">
          Set up {machine.machineCode}
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <MachineStatusControl
              machineId={machineId}
              machineCode={machine.machineCode}
              status={machine.status}
              next={MACHINE_STATUS_TRANSITIONS[machine.status] ?? []}
              canEdit={hasPermission(session, 'machines.status.manage')}
            />
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
              locations={[...locations]
                .sort((a, b) => a.data.name.localeCompare(b.data.name))
                .map(({ id, data }) => ({ id, name: data.name }))}
              canEdit={hasPermission(session, 'machines.relocate')}
            />
            {history.length > 0 ? (
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
                  History
                </p>
                <ul className="flex flex-col gap-1 text-sm">
                  {history.map((entry, index) => (
                    <li key={index} className="text-muted-foreground">
                      <span className="text-foreground">
                        {(entry.locationId && names.get(entry.locationId)) ??
                          entry.venueName ??
                          'No location'}
                      </span>
                      {' · '}
                      {day.format(entry.effectiveFrom.toDate())} –{' '}
                      {entry.effectiveTo
                        ? day.format(entry.effectiveTo.toDate())
                        : 'now'}
                      {entry.reason ? ` · ${entry.reason}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {canSeeOwners ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Owner</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-foreground text-sm">
                Owned by{' '}
                {machine.ownerPartnerId ? (
                  <Link
                    href={`/admin/vending/partners/${machine.ownerPartnerId}`}
                    className="font-semibold hover:underline"
                  >
                    {ownerName(machine.ownerPartnerId)}
                  </Link>
                ) : (
                  <span className="font-semibold">Snack Quest</span>
                )}
                {activeAgreement
                  ? ` · agreement active${activeAgreement.data.revenueSharePartnerPct !== null ? ` (${activeAgreement.data.revenueSharePartnerPct}% to owner)` : ''}`
                  : machine.ownerPartnerId
                    ? ' · no active agreement'
                    : ''}
              </p>
              {hasPermission(session, 'owners.manage') ? (
                <MachineOwnerControl
                  machineId={machineId}
                  currentOwnerId={machine.ownerPartnerId ?? null}
                  owners={[...owners]
                    .sort((a, b) => a.data.name.localeCompare(b.data.name))
                    .map(({ id, data }) => ({
                      id,
                      name: data.name,
                      status: data.status,
                    }))}
                  hasActiveAgreement={activeAgreement !== null}
                />
              ) : null}
              {ownerHistory.length > 0 ? (
                <div>
                  <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
                    History
                  </p>
                  <ul className="flex flex-col gap-1 text-sm">
                    {ownerHistory.map((entry, index) => (
                      <li key={index} className="text-muted-foreground">
                        <span className="text-foreground">
                          {ownerName(entry.partnerId)}
                        </span>
                        {' · '}
                        {day.format(entry.effectiveFrom.toDate())} –{' '}
                        {entry.effectiveTo
                          ? day.format(entry.effectiveTo.toDate())
                          : 'now'}
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
    </div>
  );
}
