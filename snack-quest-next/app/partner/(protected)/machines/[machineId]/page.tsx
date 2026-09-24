import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, CircleDot, MapPin, Radio, ShoppingBag, Wrench } from 'lucide-react';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { ownerPortalService, PartnerDoesNotOwnMachineError, OWNER_PERFORMANCE_WINDOWS_DAYS } from '@/services/ownerPortalService';
import { machineInventoryReserveService } from '@/services/machineInventoryReserveService';
import { locationService } from '@/services/locationService';
import { LocationExpensesForm } from '@/components/partner/LocationExpensesForm';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Machine' };

const WINDOW_LABEL: Record<(typeof OWNER_PERFORMANCE_WINDOWS_DAYS)[number], string> = {
  1: 'Today',
  7: '7 days',
  30: '30 days',
  90: '90 days',
};

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** § MACHINE DETAIL — overview, revenue/transactions/AOV/units, inventory + KSh100K baseline + stock health, top products, profit, performance windows, operations status, location. */
export default async function PartnerMachineDetailPage({ params }: { params: Promise<{ machineId: string }> }) {
  const session = await requirePartnerSession();
  const { machineId } = await params;

  let detail: Awaited<ReturnType<typeof ownerPortalService.getMachineDetail>>;
  try {
    detail = await ownerPortalService.getMachineDetail(session.businessId, session.partnerId, machineId);
  } catch (error) {
    if (error instanceof MachineNotFoundError || error instanceof PartnerDoesNotOwnMachineError) {
      notFound();
    }
    throw error;
  }
  const [reserve, fullLocation] = await Promise.all([
    machineInventoryReserveService.getReserveStatus(session.businessId, machineId),
    detail.location ? locationService.findById(session.businessId, detail.location.id) : Promise.resolve(null),
  ]);

  const [today, sevenDay, thirtyDay, ninetyDay] = OWNER_PERFORMANCE_WINDOWS_DAYS.map((days) => detail.performanceByWindow[days]);
  const aov30d = thirtyDay.transactionCount > 0 ? Math.round(thirtyDay.revenueKes / thirtyDay.transactionCount) : null;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/partner" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to dashboard
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{detail.machineCode}</h1>
        <span className={`flex items-center gap-1.5 text-sm font-medium capitalize ${detail.connectivity === 'online' ? 'text-success' : detail.connectivity === 'offline' ? 'text-danger' : 'text-warning'}`}>
          <CircleDot className="size-3.5" aria-hidden="true" />
          {detail.connectivity}
        </span>
      </div>

      {detail.location ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-4 text-sm">
            <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="font-medium text-foreground">{detail.location.name}</span>
            <span className="text-muted-foreground">&middot; {detail.location.city}{detail.location.area ? `, ${detail.location.area}` : ''}</span>
          </CardContent>
        </Card>
      ) : null}

      {detail.location ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your location costs</CardTitle>
          </CardHeader>
          <CardContent>
            <LocationExpensesForm
              locationId={detail.location.id}
              initial={{
                monthlyRentKes: fullLocation?.expenses?.monthlyRentKes ?? null,
                placementFeeKes: fullLocation?.expenses?.placementFeeKes ?? null,
                monthlyElectricityKes: fullLocation?.expenses?.monthlyElectricityKes ?? null,
                locationCommissionPct: fullLocation?.expenses?.locationCommissionPct ?? null,
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Performance</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[[1, today], [7, sevenDay], [30, thirtyDay], [90, ninetyDay]].map(([days, summary]) => (
            <Card key={days as number}>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">{WINDOW_LABEL[days as (typeof OWNER_PERFORMANCE_WINDOWS_DAYS)[number]]}</p>
                <p className="mt-1 text-lg font-bold text-foreground">KES {(summary as typeof today).revenueKes.toLocaleString('en-KE')}</p>
                <p className="text-xs text-muted-foreground">{(summary as typeof today).unitsSold} units &middot; {(summary as typeof today).transactionCount} sales</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">AOV (30d)</p>
            <p className="mt-1 text-lg font-bold text-foreground">{aov30d !== null ? `KES ${aov30d.toLocaleString('en-KE')}` : '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Top category (30d)</p>
            <p className="mt-1 text-lg font-bold text-foreground">{thirtyDay.topCategory ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Stock health</p>
            <p className="mt-1 text-lg font-bold text-foreground">{thirtyDay.stockHealth.sellableCount}/{thirtyDay.stockHealth.assortmentCount}</p>
            <p className="text-xs text-muted-foreground">sellable / assorted</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Lifetime profit</p>
            <p className="mt-1 text-lg font-bold text-foreground">KES {detail.lifetimeDistributableProfitKes.toLocaleString('en-KE')}</p>
            <p className="text-xs text-muted-foreground">From finalized settlements</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
          <ShoppingBag className="size-4" aria-hidden="true" />
          KSh 100K inventory baseline
        </h2>
        <Card>
          <CardContent className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Target</p>
              <p className="font-semibold text-foreground">KES {reserve.targetKes.toLocaleString('en-KE')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">On hand (at cost)</p>
              <p className="font-semibold text-foreground">KES {reserve.currentAtCostKes.toLocaleString('en-KE')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Variance</p>
              <p className={`font-semibold ${reserve.varianceKes < 0 ? 'text-danger' : 'text-success'}`}>
                {reserve.varianceKes >= 0 ? '+' : ''}KES {reserve.varianceKes.toLocaleString('en-KE')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
          <Radio className="size-4" aria-hidden="true" />
          Operations
        </h2>
        <Card>
          <CardContent className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Last heartbeat</p>
              <p className="font-semibold text-foreground">{relativeTime(detail.lastHeartbeatAt)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last sale</p>
              <p className="font-semibold text-foreground">{relativeTime(detail.lastSaleAt)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last restock</p>
              <p className="font-semibold text-foreground">{detail.lastRestock ? relativeTime(detail.lastRestock.createdAt) : 'Never'}</p>
              {detail.lastRestock ? <p className="text-xs capitalize text-muted-foreground">{detail.lastRestock.status.replace('_', ' ')}</p> : null}
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs text-muted-foreground"><Wrench className="size-3" aria-hidden="true" />Faults (30d)</p>
              <p className="font-semibold text-foreground">{thirtyDay.faultCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
