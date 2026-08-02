import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { customerService } from '@/services/customerService';
import { walletService } from '@/services/walletService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OrderStatusBadge } from '@/components/admin/OrderStatusBadge';
import { CustomerWalletCard } from '@/components/admin/CustomerWalletCard';
import { formatDate, formatDateTime, formatKes } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Customer detail' };

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ phoneNumber: string }>;
}) {
  const session = await requireStaffSession();
  const { phoneNumber: encodedPhoneNumber } = await params;
  const phoneNumber = decodeURIComponent(encodedPhoneNumber);

  const [{ summary, orders }, walletBalance, walletLedger] = await Promise.all([
    customerService.getCustomerOrders(session.businessId, phoneNumber),
    walletService.getBalance(session.businessId, phoneNumber),
    walletService.getLedger(session.businessId, phoneNumber),
  ]);
  if (!summary) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/customers"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Customers
        </Link>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">{summary.customerName}</h1>
        <p className="mt-1 text-sm text-muted-foreground tabular-nums">
          {summary.phoneNumber} · {summary.county}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-caption text-muted-foreground uppercase">Orders</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{summary.orderCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-caption text-muted-foreground uppercase">Total spent</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{formatKes(summary.totalSpentKes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-caption text-muted-foreground uppercase">Last order</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{formatDate(summary.lastOrderAt)}</p>
          </CardContent>
        </Card>
      </div>

      <CustomerWalletCard
        phoneNumber={summary.phoneNumber}
        balanceKes={walletBalance.balanceKes}
        lifetimeCreditsEarnedKes={walletBalance.lifetimeCreditsEarnedKes}
        ledger={walletLedger.map(({ id, data }) => ({
          id,
          type: data.type,
          amountKes: data.amountKes,
          balanceAfterKes: data.balanceAfterKes,
          note: data.note,
          createdAt: formatDateTime(data.createdAt),
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle>Order history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                <tr>
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
                      <Link href={`/admin/orders/${id}`} className="font-medium text-foreground hover:underline">
                        {data.product.packageLabel}
                      </Link>
                    </td>
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
        </CardContent>
      </Card>
    </div>
  );
}
