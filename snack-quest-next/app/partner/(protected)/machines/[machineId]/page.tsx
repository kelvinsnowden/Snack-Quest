import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  Camera,
  CircleDot,
  DoorOpen,
  MapPin,
  Radio,
  ShoppingBag,
  Thermometer,
  TrendingUp,
  Wifi,
  Wrench,
} from 'lucide-react';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { ownerPortalService, PartnerDoesNotOwnMachineError, OWNER_PERFORMANCE_WINDOWS_DAYS } from '@/services/ownerPortalService';
import { machineInventoryReserveService } from '@/services/machineInventoryReserveService';
import { locationService } from '@/services/locationService';
import { LocationExpensesForm } from '@/components/partner/LocationExpensesForm';
import { RestockRequestButton } from '@/components/partner/RestockRequestButton';
import { DailySalesBarChart } from '@/components/partner/DailySalesBarChart';
import { StockLevelBar } from '@/components/partner/StockLevelBar';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';

export const metadata: Metadata = { title: 'Machine' };

const WINDOW_LABEL: Record<(typeof OWNER_PERFORMANCE_WINDOWS_DAYS)[number], string> = {
  1: 'Today',
  7: '7 days',
  30: '30 days',
  90: '90 days',
};

const SLOT_STATUS_BADGE: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'outline' }> = {
  in_stock: { label: 'In stock', variant: 'success' },
  low_stock: { label: 'Low stock', variant: 'warning' },
  out_of_stock: { label: 'Out of stock', variant: 'danger' },
  empty_slot: { label: 'Empty slot', variant: 'outline' },
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

/** § MACHINE DETAIL — Overview/Inventory/Sales/Health tabs, per the owner-portal mockup's own machine-detail flow. Camera is a separate screen (a quick-action link), not a 5th tab — a camera is optional hardware, unlike the other four which always apply. */
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

  const [reserve, fullLocation, inventory, health, salesTrend, topProducts, recentActivity, cameras] = await Promise.all([
    machineInventoryReserveService.getReserveStatus(session.businessId, machineId),
    detail.location ? locationService.findById(session.businessId, detail.location.id) : Promise.resolve(null),
    ownerPortalService.getMachineInventory(session.businessId, session.partnerId, machineId),
    ownerPortalService.getMachineHealth(session.businessId, session.partnerId, machineId),
    ownerPortalService.getSalesTrend(session.businessId, session.partnerId, 30, machineId),
    ownerPortalService.getTopProducts(session.businessId, session.partnerId, 30, machineId, 5),
    ownerPortalService.getRecentActivity(session.businessId, session.partnerId, 10, machineId),
    ownerPortalService.listCamerasForMachine(session.businessId, session.partnerId, machineId),
  ]);

  const [today, sevenDay, thirtyDay, ninetyDay] = OWNER_PERFORMANCE_WINDOWS_DAYS.map((days) => detail.performanceByWindow[days]);
  const aov30d = thirtyDay.transactionCount > 0 ? Math.round(thirtyDay.revenueKes / thirtyDay.transactionCount) : null;

  const overviewPanel = (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Performance</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[[1, today] as const, [7, sevenDay] as const, [30, thirtyDay] as const, [90, ninetyDay] as const].map(([days, summary]) => (
            <Card key={days}>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">{WINDOW_LABEL[days]}</p>
                <p className="mt-1 text-lg font-bold text-foreground">KES {summary.revenueKes.toLocaleString('en-KE')}</p>
                <p className="text-xs text-muted-foreground">
                  {summary.unitsSold} units &middot; {summary.transactionCount} sales
                </p>
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
            <p className="mt-1 text-lg font-bold text-foreground">
              {thirtyDay.stockHealth.sellableCount}/{thirtyDay.stockHealth.assortmentCount}
            </p>
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
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Wrench className="size-3" aria-hidden="true" />
                Faults (30d)
              </p>
              <p className="font-semibold text-foreground">{thirtyDay.faultCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {detail.location ? (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-foreground">Location</h2>
          <div className="flex flex-col gap-3">
            <Card>
              <CardContent className="flex items-center gap-2 p-4 text-sm">
                <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium text-foreground">{detail.location.name}</span>
                <span className="text-muted-foreground">
                  &middot; {detail.location.city}
                  {detail.location.area ? `, ${detail.location.area}` : ''}
                </span>
              </CardContent>
            </Card>
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
          </div>
        </div>
      ) : null}
    </div>
  );

  const inventoryPanel = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">{inventory.counts.all}</span> slots
          </span>
          <span>
            <span className="font-semibold text-warning">{inventory.counts.lowStock}</span> low
          </span>
          <span>
            <span className="font-semibold text-danger">{inventory.counts.outOfStock}</span> out
          </span>
        </div>
        <RestockRequestButton machineId={machineId} />
      </div>

      {inventory.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No slots configured yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {inventory.items.map((item) => {
            const pct = item.capacity > 0 ? (item.currentQuantity / item.capacity) * 100 : 0;
            const badge = SLOT_STATUS_BADGE[item.status];
            return (
              <Card key={item.slotCode}>
                <CardContent className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">{item.slotCode}</span>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{item.productName ?? 'Empty'}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {item.currentQuantity}/{item.capacity}
                    </span>
                    <span>KES {item.priceKes.toLocaleString('en-KE')}</span>
                  </div>
                  <StockLevelBar percent={pct} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  const salesPanel = (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="size-4" aria-hidden="true" />
            Daily sales (30 days)
          </CardTitle>
        </CardHeader>
        <CardContent>{salesTrend.length === 0 ? <p className="text-sm text-muted-foreground">No sales recorded yet.</p> : <DailySalesBarChart points={salesTrend} />}</CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Top Selling Products</h2>
        {topProducts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No sales recorded yet.</p>
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              {topProducts.map((product) => (
                <div key={product.productId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-foreground">{product.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {product.unitsSold} units · KES {product.revenueKes.toLocaleString('en-KE')}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Recent Sales</h2>
        {recentActivity.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No sales recorded yet.</p>
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              {recentActivity.map((item) => (
                <div key={item.transactionId} className="flex items-center justify-between gap-3 border-b border-border pb-3 text-sm last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium text-foreground">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">{relativeTime(item.dispensedAt)}</p>
                  </div>
                  <span className="shrink-0 font-semibold text-foreground">KES {item.amountKes.toLocaleString('en-KE')}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

  const healthPanel = (
    <div className="flex flex-col gap-4">
      <Card className={health.overallHealthy ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5'}>
        <CardContent className="p-4">
          <p className={`text-sm font-semibold ${health.overallHealthy ? 'text-success' : 'text-danger'}`}>
            {health.overallHealthy ? 'All systems normal' : 'Needs attention'}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wifi className="size-3.5" aria-hidden="true" />
              Network
            </span>
            <Badge variant={health.networkOk ? 'success' : 'danger'} className="w-fit">
              {health.networkOk ? 'Online' : 'Offline'}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Radio className="size-3.5" aria-hidden="true" />
              Controller
            </span>
            <Badge variant={health.controllerOnline ? 'success' : 'danger'} className="w-fit">
              {health.controllerOnline ? 'Online' : 'Offline'}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">Payment system</span>
            <Badge variant={health.paymentSystemOk ? 'success' : 'danger'} className="w-fit">
              {health.paymentSystemOk ? 'OK' : 'Issue'}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Thermometer className="size-3.5" aria-hidden="true" />
              Temperature
            </span>
            <span className="font-semibold text-foreground">{health.temperatureCelsius !== null ? `${health.temperatureCelsius}°C` : '—'}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <DoorOpen className="size-3.5" aria-hidden="true" />
              Door
            </span>
            <span className="font-semibold text-foreground">{health.doorOpen === null ? '—' : health.doorOpen ? 'Open' : 'Closed'}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Camera className="size-3.5" aria-hidden="true" />
              Camera
            </span>
            <Badge variant={health.cameraStatus === 'active' ? 'success' : health.cameraStatus === 'issue' ? 'danger' : 'outline'} className="w-fit capitalize">
              {health.cameraStatus.replace('_', ' ')}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Recent Events</h2>
        {health.recentEvents.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No events reported yet.</p>
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              {health.recentEvents.map((event) => (
                <div key={event.id} className="flex items-center justify-between gap-3 border-b border-border pb-3 text-sm last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium text-foreground">{event.label}</p>
                    {event.detail ? <p className="text-xs text-muted-foreground">{event.detail}</p> : null}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(event.occurredAt)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <Link href="/partner/machines" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to machines
      </Link>

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">{detail.machineCode}</h1>
        <div className="flex items-center gap-3">
          {cameras.length > 0 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/partner/machines/${machineId}/camera`}>
                <Camera aria-hidden="true" />
                Camera
              </Link>
            </Button>
          ) : null}
          <span className={`flex items-center gap-1.5 text-sm font-medium capitalize ${detail.connectivity === 'online' ? 'text-success' : detail.connectivity === 'offline' ? 'text-danger' : 'text-warning'}`}>
            <CircleDot className="size-3.5" aria-hidden="true" />
            {detail.connectivity}
          </span>
        </div>
      </div>

      <Tabs
        defaultValue="overview"
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'inventory', label: 'Inventory' },
          { value: 'sales', label: 'Sales' },
          { value: 'health', label: 'Health' },
        ]}
        panels={{ overview: overviewPanel, inventory: inventoryPanel, sales: salesPanel, health: healthPanel }}
      />
    </div>
  );
}
