import type { Metadata } from 'next';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { orderRepository } from '@/repositories/orderRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { EmptyOrdersState } from '@/components/admin/EmptyOrdersState';
import { OrdersTable } from '@/components/admin/OrdersTable';
import { StaffInitiatedOrderDialog } from '@/components/admin/StaffInitiatedOrderDialog';
import { guaranteedPickCountFor } from '@/lib/packages/guaranteedPicks';
import { getLocale } from '@/lib/i18n/getLocale';
import { getDictionary } from '@/lib/i18n/dictionary';
import { ORDER_STATUS_LABELS } from '@/lib/orders/transitions';
import { formatDate } from '@/lib/orders/format';
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
  const dict = getDictionary(await getLocale());

  const trimmedQuery = q?.trim();

  /*
   * The box list and the order list are independent, so they are
   * awaited together rather than one after the other. That matters more
   * here than it looks: Firestore lives in `africa-south1` and the
   * functions in `cpt1`, so every round trip has a real floor, and two
   * sequential reads cost twice one. See docs/HOSTING_REGIONS.md.
   */
  const [boxes, orderResult] = await Promise.all([
    packageRepository.listActive(session.businessId),
    (async () => {
      if (trimmedQuery) {
        const found = PHONE_LIKE.test(trimmedQuery)
          ? await orderRepository.searchByPhoneNumber(session.businessId, trimmedQuery)
          : await orderRepository.searchByCustomerNamePrefix(session.businessId, trimmedQuery);
        return { orders: found, nextCursor: null as string | null };
      }
      const validStatus = STATUS_FILTERS.includes(status as OrderStatus) ? (status as OrderStatus) : undefined;
      return orderRepository.listByBusiness(session.businessId, { status: validStatus, cursor });
    })(),
  ]);

  // Projected to plain fields: `Package` carries Firestore Timestamps,
  // which cannot cross into a Client Component.
  const orderableBoxes = boxes.map(({ id, data }) => ({
    id,
    name: data.name,
    priceKes: data.priceKes,
    // Read through the same helper the checkout and the server-side
    // validation use, so "does this box offer picks" cannot mean one
    // thing here and another where it is enforced.
    guaranteedPickCount: guaranteedPickCountFor(data),
  }));

  const orders: { id: string; data: Order }[] = orderResult.orders;
  const nextCursor: string | null = orderResult.nextCursor;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{dict.orders.title}</h1>
          <p className="hidden sm:block mt-1 text-sm text-muted-foreground">
            {dict.orders.subtitle}
          </p>
        </div>
        <StaffInitiatedOrderDialog boxes={orderableBoxes} canRecordManualPayment={isSuperAdmin(session)} />
      </div>

      <Card className="p-4">
        <form action="/admin/orders" method="GET" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="q">{dict.orders.searchLabel}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="q" name="q" defaultValue={q} placeholder="Jane Wanjiru or 254712345678" className="pl-9" />
            </div>
          </div>
          <Button type="submit">{dict.orders.search}</Button>
          {trimmedQuery ? (
            <Button asChild variant="ghost">
              <Link href="/admin/orders">{dict.orders.clear}</Link>
            </Button>
          ) : null}
        </form>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          <Link
            href="/admin/orders"
            className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-medium transition-colors ${
              !status && !trimmedQuery ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/40'
            }`}
          >
            {dict.orders.all}
          </Link>
          {STATUS_FILTERS.map((value) => (
            <Link
              key={value}
              href={`/admin/orders?status=${value}`}
              className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-medium transition-colors ${
                status === value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/40'
              }`}
            >
              {dict.orderStatus[value] ?? ORDER_STATUS_LABELS[value]}
            </Link>
          ))}
        </div>
      </Card>

      {orders.length === 0 ? (
        <EmptyOrdersState hasFilter={Boolean(trimmedQuery || status)} />
      ) : (
        <OrdersTable
          orders={orders.map(({ id, data }) => ({
            id,
            orderNumber: data.orderNumber ?? null,
            customerName: data.customer.customerName,
            phoneNumber: data.customer.phoneNumber,
            packageLabel: data.product.packageLabel,
            totalKes: data.pricing.totalKes,
            status: data.status,
            fulfillmentBatchId: data.fulfillmentBatchId,
            createdAtLabel: formatDate(data.createdAt),
          }))}
        />
      )}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link href={`/admin/orders?${status ? `status=${status}&` : ''}cursor=${nextCursor}`}>
              {dict.orders.loadMore}
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
