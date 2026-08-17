import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Banknote,
  ClipboardList,
  MessageCircleWarning,
  Package,
  ShieldAlert,
  Truck,
  Users,
} from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { ADMIN_SECTIONS, visibleAdminSections, type AdminSection } from '@/lib/auth/adminSections';
import { orderRepository } from '@/repositories/orderRepository';
import { conversationRepository } from '@/repositories/conversationRepository';
import { staffRepository } from '@/repositories/staffRepository';
import { businessRepository } from '@/repositories/businessRepository';
import { businessAnalyticsService } from '@/services/businessAnalyticsService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { OrderStatusBadge } from '@/components/admin/OrderStatusBadge';
import { TrendStatCard } from '@/components/admin/TrendStatCard';
import { RevenueChart } from '@/components/admin/RevenueChart';
import { TrafficChart } from '@/components/admin/TrafficChart';
import { StatusDonutChart, type DonutSlice } from '@/components/admin/StatusDonutChart';
import { formatDate, formatKes } from '@/lib/orders/format';
import { computePeriodTrend } from '@/lib/analytics/trend';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Dashboard' };

const QUICK_LINKS: { href: string; label: string; description: string; icon: typeof ClipboardList; section: AdminSection }[] = [
  { href: '/admin/orders', label: 'Orders', description: 'Every order, oldest to newest', icon: ClipboardList, section: 'orders' },
  { href: '/admin/products', label: 'Products', description: 'Manage boxes and pricing', icon: Package, section: 'orders' },
  { href: '/admin/deliveries', label: 'Deliveries', description: 'Track every shipment', icon: Truck, section: 'orders' },
  { href: '/admin/withdrawals', label: 'Withdrawals', description: 'Creator payout requests', icon: Banknote, section: 'finance' },
];

/** First letter of each of up to two words — the same "no photo, still recognisable" treatment initials-avatars use everywhere. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * The admin landing page (§ Complete the Admin Portal). Previously
 * three counters and a card that said "more is on the way" — but
 * Orders, Products, Inventory, Creators, and Deliveries were all
 * already real, finished sections by the time that copy was written
 * and never updated. Replaced with what a dashboard should actually
 * answer on arrival: how much came in, what needs attention right
 * now, and where do I go next.
 *
 * Every number here is a repository/service call already used
 * elsewhere in the admin portal (revenue and delivery mirror
 * /admin/analytics, recent orders mirrors /admin/orders, traffic
 * mirrors /admin/analytics's own visitor chart) — no new backend,
 * only wiring what already exists into the one page staff actually
 * land on, and giving it the visual rhythm a dashboard should have:
 * one real chart, one real composition view, one real list.
 */
export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ accessDenied?: string }>;
}) {
  const session = await requireStaffSession();
  const { accessDenied } = await searchParams;
  const deniedSection = ADMIN_SECTIONS.find((s) => s.key === accessDenied);

  const visibleSections = visibleAdminSections(session);
  const quickLinks = visibleSections === null ? QUICK_LINKS : QUICK_LINKS.filter((link) => visibleSections.includes(link.section));

  const [business, totalOrders, agentQueueCount, staff, revenue, recentOrders, delivery, traffic] =
    await Promise.all([
      businessRepository.findById(session.businessId),
      orderRepository.countByBusiness(session.businessId),
      conversationRepository.countByStatus(
        session.businessId,
        'agent_assigned',
      ),
      staffRepository.listByBusiness(session.businessId),
      businessAnalyticsService.getRevenueOverview(session.businessId, 30),
      orderRepository.listByBusiness(session.businessId, { limit: 5 }),
      businessAnalyticsService.getDeliveryPerformance(session.businessId),
      businessAnalyticsService.getTraffic(session.businessId, 30),
    ]);

  const revenueTrend = computePeriodTrend(
    revenue.totalRevenueKes,
    revenue.previousPeriod.totalRevenueKes,
    'vs previous 30 days',
  );
  const revenueDeltaKes = revenue.totalRevenueKes - revenue.previousPeriod.totalRevenueKes;

  const STATUS_COLOR: Record<string, string> = {
    delivered: 'var(--color-success)',
    in_transit: 'var(--color-secondary)',
    created: 'var(--color-primary)',
    pending_manual_booking: 'var(--color-warning)',
    pending: 'var(--color-muted)',
    failed: 'var(--color-danger)',
  };
  const statusSlices: DonutSlice[] = delivery.statusBreakdown.map((s) => ({
    key: s.status,
    label: s.label,
    count: s.count,
    color: STATUS_COLOR[s.status] ?? 'var(--color-muted)',
  }));
  const METHOD_COLOR: Record<string, string> = {
    pickup: 'var(--color-primary)',
    door: 'var(--color-secondary)',
  };
  const methodSlices: DonutSlice[] = delivery.methodBreakdown.map((m) => ({
    key: m.method,
    label: m.method === 'pickup' ? 'Pickup station' : 'Door delivery',
    count: m.count,
    color: METHOD_COLOR[m.method] ?? 'var(--color-muted)',
  }));

  return (
    <div className="flex flex-col gap-6">
      {deniedSection ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-center gap-3 pt-6">
            <ShieldAlert className="size-5 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-sm text-foreground">
              You don&apos;t have access to <strong>{deniedSection.label}</strong>. Ask a super admin if you need it.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div>
        <h1 className="text-page-title text-foreground font-bold tracking-tight">
          Welcome back, {session.displayName.split(' ')[0]}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Here&apos;s what&apos;s happening at {business?.name ?? 'Snack Quest'}{' '}
          right now.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TrendStatCard
          label="Revenue (30 days)"
          value={formatKes(revenue.totalRevenueKes)}
          icon={<Banknote className="size-5" />}
          trend={revenueTrend}
          sparkline={revenue.days.map((d) => d.revenueKes)}
        />
        <TrendStatCard
          label="Total orders"
          value={totalOrders.toLocaleString()}
          icon={<ClipboardList className="size-5" />}
          tone="secondary"
        />
        <TrendStatCard
          label="Awaiting a human agent"
          value={agentQueueCount.toLocaleString()}
          icon={<MessageCircleWarning className="size-5" />}
          tone={agentQueueCount > 0 ? 'warning' : 'secondary'}
        />
        <TrendStatCard
          label="Staff members"
          value={staff.length.toLocaleString()}
          icon={<Users className="size-5" />}
          tone="secondary"
        />
      </div>

      {revenueTrend ? (
        <div
          className={
            'rounded-lg border p-4 text-sm ' +
            (revenueTrend.percent >= 0
              ? 'border-success/20 bg-success/5 text-success'
              : 'border-danger/20 bg-danger/5 text-danger')
          }
        >
          <span className="font-medium">
            {revenueTrend.percent >= 0 ? 'Revenue is up' : 'Revenue is down'}{' '}
            {Math.abs(revenueTrend.percent).toFixed(1)}% vs the previous 30 days
          </span>{' '}
          <span className="text-foreground/80">
            ({revenueTrend.percent >= 0 ? '+' : '−'}
            {formatKes(Math.abs(revenueDeltaKes))} {revenueTrend.percent >= 0 ? 'more' : 'less'} than last period)
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue, last 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueChart days={revenue.days} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Delivery snapshot</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {delivery.totalShipments > 0 ? (
              <>
                <StatusDonutChart slices={statusSlices} totalLabel="shipments" />
                <div className="border-t border-border pt-6">
                  <StatusDonutChart slices={methodSlices} totalLabel="shipments" />
                </div>
              </>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No shipments recorded yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Website visitors, last 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            {traffic.totalVisits > 0 ? (
              <>
                <TrafficChart days={traffic.days} />
                <div className="mt-3 flex items-center gap-4 text-caption text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
                    Page views
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="size-2 rounded-full bg-secondary" />
                    Visitors
                  </span>
                </div>
                {traffic.topPages.length > 0 ? (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
                      Top pages
                    </p>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {traffic.topPages.slice(0, 5).map((page) => (
                        <li key={page.path} className="flex items-center justify-between gap-3 text-sm">
                          <span className="truncate text-foreground">{page.path}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {page.visits.toLocaleString()} visit{page.visits === 1 ? '' : 's'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No visits recorded yet — this fills in as people browse the site.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Jump to</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 p-3 pt-0">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-3 rounded-md p-3 transition-colors hover:bg-border/30"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <link.icon className="size-4" aria-hidden="true" />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium text-foreground">{link.label}</span>
                  <span className="block text-caption text-muted-foreground">{link.description}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle>Recent orders</CardTitle>
          <Link
            href="/admin/orders"
            className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            View all
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </CardHeader>
        <CardContent className="pt-0">
          {recentOrders.orders.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No orders yet"
              description="Real orders placed through checkout will show up here as soon as the first one lands."
            />
          ) : (
            <div className="border-border overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-border text-caption text-muted-foreground border-b text-left font-medium tracking-wide uppercase">
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Placed</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.orders.map(({ id, data }) => {
                    const customerLabel = data.customer.customerName || data.customer.phoneNumber;
                    return (
                      <tr key={id} className="border-border border-b last:border-0">
                        <td className="px-4 py-3">
                          <Link href={`/admin/orders/${id}`} className="group flex items-center gap-3">
                            <span
                              aria-hidden="true"
                              className={cn(
                                'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                                'bg-secondary/10 text-secondary',
                              )}
                            >
                              {initials(customerLabel)}
                            </span>
                            <span className="text-foreground font-medium group-hover:underline">{customerLabel}</span>
                          </Link>
                        </td>
                        <td className="text-foreground px-4 py-3 tabular-nums">
                          {formatKes(data.pricing.totalKes)}
                        </td>
                        <td className="px-4 py-3">
                          <OrderStatusBadge status={data.status} />
                        </td>
                        <td className="text-muted-foreground px-4 py-3 tabular-nums">
                          {formatDate(data.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
