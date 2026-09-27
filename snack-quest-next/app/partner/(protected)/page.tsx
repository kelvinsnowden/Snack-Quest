import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Camera,
  CircleDot,
  MapPin,
  Package,
} from 'lucide-react';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { ownerPortalService } from '@/services/ownerPortalService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SalesTrendChart } from '@/components/partner/SalesTrendChart';
import { StockLevelBar } from '@/components/partner/StockLevelBar';
import { StatusPill } from '@/components/partner/StatusPill';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Overview' };

const WINDOW_DAYS = 30;

const QUICK_NAV = [
  { href: '/partner/machines', label: 'Machines', description: 'View and manage your machines.', icon: Boxes, tone: 'primary' as const },
  { href: '/partner/sales', label: 'Sales', description: 'Track transactions and sales activity.', icon: BarChart3, tone: 'success' as const },
  { href: '/partner/inventory', label: 'Inventory', description: 'Monitor stock levels.', icon: Package, tone: 'secondary' as const },
  { href: '/partner/locations', label: 'Locations', description: 'See where your machines are placed.', icon: MapPin, tone: 'primary' as const },
];

const TONE_CLASSES: Record<'primary' | 'success' | 'secondary', string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  secondary: 'bg-secondary/10 text-secondary',
};

/**
 * § OWNER DASHBOARD, redesigned to match the reference mockup (§ Owner
 * Portal dark redesign) — a greeting header, a row of quick links into
 * the portal's own sections, the fleet list, then a 2x2 grid of
 * activity previews. Every figure still comes from `ownerPortalService`
 * — nothing here computes its own number. Two preview cards
 * (Locations, Cameras) deliberately show a real, if simple, summary
 * rather than the mockup's literal map/live-camera-thumbnail: neither
 * a map library nor per-machine live-frame fetching is wired up yet,
 * and a fabricated one would be worse than an honest summary linking to
 * where the real thing (§ `/partner/locations`, `/partner/cameras`)
 * already lives.
 */
export default async function PartnerDashboardPage() {
  const session = await requirePartnerSession();
  const [dashboard, points] = await Promise.all([
    ownerPortalService.getDashboard(session.businessId, session.partnerId, WINDOW_DAYS),
    ownerPortalService.getSalesTrend(session.businessId, session.partnerId, WINDOW_DAYS),
  ]);

  const firstName = dashboard.partner.name.split(' ')[0];
  const locationCounts = new Map<string, number>();
  for (const machine of dashboard.machines) {
    const key = machine.locationName ?? 'Unassigned';
    locationCounts.set(key, (locationCounts.get(key) ?? 0) + 1);
  }
  const topStocked = [...dashboard.machines]
    .map((machine) => ({
      machine,
      percent: machine.stockHealth.assortmentCount > 0 ? (machine.stockHealth.sellableCount / machine.stockHealth.assortmentCount) * 100 : 100,
    }))
    .sort((a, b) => a.percent - b.percent)
    .slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Good to see you, {firstName} 👋</h1>
        <p className="text-sm text-muted-foreground">Manage your machines, track performance and stay in control — all in one place.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {QUICK_NAV.map(({ href, label, description, icon: Icon, tone }) => (
          <Card key={href}>
            <CardContent className="flex flex-col gap-3 p-4">
              <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', TONE_CLASSES[tone])}>
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <Link
                href={href}
                aria-label={label}
                className="flex size-8 items-center justify-center self-end rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Your Machines</CardTitle>
            <p className="text-sm text-muted-foreground">All your machines in one place.</p>
          </div>
          <Link href="/partner/machines" className="text-sm font-medium text-primary hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 p-4 pt-0">
          {dashboard.machines.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No machines yet.</p>
          ) : (
            dashboard.machines.slice(0, 5).map((machine) => (
              <Link
                key={machine.machineId}
                href={`/partner/machines/${machine.machineId}`}
                className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-border/10"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-border/30 text-muted-foreground">
                  <Boxes className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">{machine.machineCode}</p>
                  {machine.locationName ? <p className="truncate text-xs text-muted-foreground">{machine.locationName}</p> : null}
                </div>
                <StatusPill connectivity={machine.connectivity} />
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground">
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </span>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Sales Activity</CardTitle>
              <p className="text-sm text-muted-foreground">View transactions and product performance.</p>
            </div>
            <Link href="/partner/sales" aria-label="Sales" className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground">
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {points.length === 0 ? <p className="text-sm text-muted-foreground">No sales recorded yet.</p> : <SalesTrendChart points={points} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Inventory Status</CardTitle>
              <p className="text-sm text-muted-foreground">Stock health across your fleet.</p>
            </div>
            <Link href="/partner/inventory" aria-label="Inventory" className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground">
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 p-4 pt-0">
            {topStocked.length === 0 ? (
              <p className="text-sm text-muted-foreground">No machines yet.</p>
            ) : (
              topStocked.map(({ machine, percent }) => (
                <div key={machine.machineId} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{machine.machineCode}</span>
                    <span>{Math.round(percent)}% stocked</span>
                  </div>
                  <StockLevelBar percent={percent} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Location Overview</CardTitle>
              <p className="text-sm text-muted-foreground">Check machine locations and status.</p>
            </div>
            <Link href="/partner/locations" aria-label="Locations" className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground">
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 p-4 pt-0">
            {locationCounts.size === 0 ? (
              <p className="text-sm text-muted-foreground">No locations yet.</p>
            ) : (
              [...locationCounts.entries()].slice(0, 4).map(([name, count]) => (
                <div key={name} className="flex items-center gap-2.5 text-sm">
                  <MapPin className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="flex-1 truncate text-foreground">{name}</span>
                  <span className="text-xs text-muted-foreground">
                    {count} machine{count === 1 ? '' : 's'}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Cameras</CardTitle>
              <p className="text-sm text-muted-foreground">View live machine cameras for remote monitoring.</p>
            </div>
            <Link href="/partner/cameras" aria-label="Cameras" className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground">
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 p-4 pt-0">
            {dashboard.machines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No machines yet.</p>
            ) : (
              dashboard.machines.slice(0, 4).map((machine) => (
                <Link
                  key={machine.machineId}
                  href={`/partner/machines/${machine.machineId}/camera`}
                  className="flex items-center gap-2.5 text-sm text-foreground transition-colors hover:text-primary"
                >
                  <Camera className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1 truncate">{machine.machineCode}</span>
                  <CircleDot className={cn('size-3', machine.connectivity === 'online' ? 'text-success' : 'text-muted-foreground')} aria-hidden="true" />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
