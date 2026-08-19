import type { Metadata } from 'next';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { customerService } from '@/services/customerService';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { EmptyCustomersState } from '@/components/admin/EmptyCustomersState';
import { MobileRecordCard, MobileRecordList } from '@/components/admin/MobileRecordCard';
import { formatDate, formatKes } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Customers' };

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireStaffSession();
  const { q } = await searchParams;
  const trimmedQuery = q?.trim();

  const customers = trimmedQuery
    ? await customerService.searchCustomers(session.businessId, trimmedQuery)
    : await customerService.listCustomers(session.businessId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">Everyone who has ordered through the WhatsApp checkout.</p>
      </div>

      <Card className="p-4">
        <form action="/admin/customers" method="GET" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="q">Search by name or phone number</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="q" name="q" defaultValue={q} placeholder="Jane Wanjiru or 254712345678" className="pl-9" />
            </div>
          </div>
          <Button type="submit">Search</Button>
          {trimmedQuery ? (
            <Button asChild variant="ghost">
              <Link href="/admin/customers">Clear</Link>
            </Button>
          ) : null}
        </form>
      </Card>

      {customers.length === 0 ? (
        <EmptyCustomersState hasFilter={Boolean(trimmedQuery)} />
      ) : (
        <>
          <MobileRecordList>
            {customers.map((customer) => (
              <MobileRecordCard
                key={customer.phoneNumber}
                href={`/admin/customers/${encodeURIComponent(customer.phoneNumber)}`}
                title={customer.customerName}
                subtitle={
                  <span className="tabular-nums">
                    {customer.phoneNumber} · {customer.county}
                  </span>
                }
                fields={[
                  { label: 'Orders', value: <span className="tabular-nums">{customer.orderCount}</span> },
                  {
                    label: 'Total spent',
                    value: <span className="font-medium tabular-nums">{formatKes(customer.totalSpentKes)}</span>,
                  },
                  {
                    label: 'Last order',
                    value: <span className="tabular-nums">{formatDate(customer.lastOrderAt)}</span>,
                  },
                ]}
              />
            ))}
          </MobileRecordList>

          <Card className="hidden overflow-hidden p-0 md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Orders</th>
                  <th className="px-4 py-3 font-medium">Total spent</th>
                  <th className="px-4 py-3 font-medium">Last order</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.phoneNumber} className="border-b border-border last:border-0 hover:bg-border/20">
                    <td className="px-4 py-3">
                      <Link href={`/admin/customers/${encodeURIComponent(customer.phoneNumber)}`} className="block">
                        <span className="font-medium text-foreground">{customer.customerName}</span>
                        <span className="block text-caption text-muted-foreground tabular-nums">
                          {customer.phoneNumber} · {customer.county}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-foreground">{customer.orderCount}</td>
                    <td className="px-4 py-3 font-medium tabular-nums text-foreground">
                      {formatKes(customer.totalSpentKes)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDate(customer.lastOrderAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </Card>
        </>
      )}
    </div>
  );
}
