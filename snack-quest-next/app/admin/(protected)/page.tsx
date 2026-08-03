import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Banknote,
  ClipboardList,
  MessageCircleWarning,
  Package,
  Truck,
  Users,
} from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { orderRepository } from '@/repositories/orderRepository';
import { conversationRepository } from '@/repositories/conversationRepository';
import { staffRepository } from '@/repositories/staffRepository';
import { businessRepository } from '@/repositories/businessRepository';
import { businessAnalyticsService } from '@/services/businessAnalyticsService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { OrderStatusBadge } from '@/components/admin/OrderStatusBadge';
import { formatDate, formatKes } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Dashboard' };

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'warning';
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
}: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-6">
        <div>
          <p className="text-caption text-muted-foreground font-medium tracking-wide uppercase">
            {label}
          </p>
          <p className="text-foreground mt-2 text-3xl font-semibold tabular-nums">
            {value}
          </p>
        </div>
        <div
          className={
            'flex size-10 shrink-0 items-center justify-center rounded-md ' +
            (tone === 'warning'
              ? 'bg-warning/10 text-warning'
              : 'bg-primary/10 text-primary')
          }
        >
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}

const QUICK_LINKS = [
  { href: '/admin/orders', label: 'Orders', icon: ClipboardList },
  { href: '/admin/products', label: 'Products', icon: Package },
  { href: '/admin/deliveries', label: 'Deliveries', icon: Truck },
  { href: '/admin/withdrawals', label: 'Withdrawals', icon: Banknote },
];

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
 * elsewhere in the admin portal (revenue mirrors /finance/revenue,
 * recent orders mirrors /admin/orders) — no new backend, only wiring
 * what already exists into the one page staff actually land on.
 */
export default async function AdminDashboardPage() {
  const session = await requireStaffSession();

  const [business, totalOrders, agentQueueCount, staff, revenue, recentOrders] =
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
    ]);

  return (
    <div className="flex flex-col gap-8">
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
        <StatCard
          label="Revenue (30 days)"
          value={formatKes(revenue.totalRevenueKes)}
          icon={Banknote}
        />
        <StatCard
          label="Total orders"
          value={totalOrders.toLocaleString()}
          icon={ClipboardList}
        />
        <StatCard
          label="Awaiting a human agent"
          value={agentQueueCount.toLocaleString()}
          icon={MessageCircleWarning}
          tone={agentQueueCount > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Staff members"
          value={staff.length.toLocaleString()}
          icon={Users}
        />
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
              description="Real orders placed on WhatsApp will show up here as soon as the first one lands."
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
                  {recentOrders.orders.map(({ id, data }) => (
                    <tr
                      key={id}
                      className="border-border border-b last:border-0"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/orders/${id}`}
                          className="text-foreground font-medium hover:underline"
                        >
                          {data.customer.customerName ||
                            data.customer.phoneNumber}
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-card-title text-foreground font-semibold">
          Jump to
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="border-border bg-surface hover:bg-border/40 flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors"
            >
              <link.icon className="text-primary size-5" aria-hidden="true" />
              <span className="text-foreground text-sm font-medium">
                {link.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
