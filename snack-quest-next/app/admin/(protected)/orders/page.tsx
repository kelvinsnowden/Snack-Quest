import type { Metadata } from 'next';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { orderRepository } from '@/repositories/orderRepository';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { EmptyOrdersState } from '@/components/admin/EmptyOrdersState';
import { OrderStatusBadge } from '@/components/admin/OrderStatusBadge';
import { ORDER_STATUS_LABELS } from '@/lib/orders/transitions';
import { formatDate, formatKes } from '@/lib/orders/format';
import type { Order, OrderStatus } from '@/types';

export const metadata: Metadata = { title: 'Orders' };

const STATUS_FILTERS: OrderStatus[] = [
  'confirmed',
  'dispatched',
  'delivered',
  'cancelled',
  'refund_requested',
  'refunded',
];

const PHONE_LIKE = /^\+?\d{9,15}$/;

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; cursor?: string }>;
}) {
  const session = await requireStaffSession();
  const { q, status, cursor } = await searchParams;

  let orders: { id: string; data: Order }[];
  let nextCursor: string | null = null;

  const trimmedQuery = q?.trim();
  if (trimmedQuery) {
    orders = PHONE_LIKE.test(trimmedQuery)
      ? await orderRepository.searchByPhoneNumber(session.businessId, trimmedQuery)
      : await orderRepository.searchByCustomerNamePrefix(session.businessId, trimmedQuery);
  } else {
    const validStatus = STATUS_FILTERS.includes(status as OrderStatus) ? (status as OrderStatus) : undefined;
    const result = await orderRepository.listByBusiness(session.businessId, {
      status: validStatus,
      cursor,
    });
    orders = result.orders;
    nextCursor = result.nextCursor;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every order placed through the WhatsApp checkout.</p>
      </div>

      <Card className="p-4">
        <form action="/admin/orders" method="GET" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="q">Search by customer name or phone number</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="q" name="q" defaultValue={q} placeholder="Jane Wanjiru or 254712345678" className="pl-9" />
            </div>
          </div>
          <Button type="submit">Search</Button>
          {trimmedQuery ? (
            <Button asChild variant="ghost">
              <Link href="/admin/orders">Clear</Link>
            </Button>
          ) : null}
        </form>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          <Link
            href="/admin/orders"
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              !status && !trimmedQuery ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/40'
            }`}
          >
            All
          </Link>
          {STATUS_FILTERS.map((value) => (
            <Link
              key={value}
              href={`/admin/orders?status=${value}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                status === value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/40'
              }`}
            >
              {ORDER_STATUS_LABELS[value]}
            </Link>
          ))}
        </div>
      </Card>

      {orders.length === 0 ? (
        <EmptyOrdersState hasFilter={Boolean(trimmedQuery || status)} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Box</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Placed</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(({ id, data }) => (
                  <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                    <td className="px-4 py-3">
                      <Link href={`/admin/orders/${id}`} className="block">
                        <span className="font-medium text-foreground">{data.customer.customerName || 'Guest'}</span>
                        <span className="block text-caption text-muted-foreground tabular-nums">
                          {data.customer.phoneNumber}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-foreground">{data.product.packageLabel}</td>
                    <td className="px-4 py-3 font-medium tabular-nums text-foreground">
                      {formatKes(data.pricing.totalKes)}
                    </td>
                    <td className="px-4 py-3">
                      <OrderStatusBadge status={data.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDate(data.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link href={`/admin/orders?${status ? `status=${status}&` : ''}cursor=${nextCursor}`}>
              Load more
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
