import type { Metadata } from 'next';
import Link from 'next/link';
import { PackageX } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { orderRepository } from '@/repositories/orderRepository';
import { isOrderBatchable } from '@/lib/fulfillmentBatches/eligibility';
import { FulfillmentBatchForm, type BatchableOrderSummary } from '@/components/admin/FulfillmentBatchForm';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = { title: 'New fulfillment batch' };

export default async function NewFulfillmentBatchPage({
  searchParams,
}: {
  searchParams: Promise<{ orderIds?: string }>;
}) {
  const session = await requireStaffSession();
  const { orderIds: orderIdsParam } = await searchParams;
  const requestedIds = Array.from(new Set((orderIdsParam ?? '').split(',').map((id) => id.trim()).filter(Boolean)));

  const orders = await Promise.all(requestedIds.map((id) => orderRepository.findById(id)));

  const eligible: BatchableOrderSummary[] = [];
  let ineligibleCount = 0;
  orders.forEach((order, index) => {
    const orderId = requestedIds[index];
    if (!order || order.businessId !== session.businessId || !isOrderBatchable(order.status, order.fulfillmentBatchId)) {
      ineligibleCount += 1;
      return;
    }
    eligible.push({
      id: orderId,
      customerName: order.customer.customerName || 'Guest',
      packageLabel: order.product.packageLabel,
      totalKes: order.pricing.totalKes,
    });
  });

  if (eligible.length === 0) {
    return (
      <div className="flex max-w-xl flex-col gap-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">New fulfillment batch</h1>
        </div>
        <EmptyState
          icon={PackageX}
          title="No eligible orders selected"
          description="Select confirmed, dispatched, or delivered orders that aren't already part of another batch from the Orders page."
          action={
            <Button asChild>
              <Link href="/admin/orders">Back to orders</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">New fulfillment batch</h1>
        <p className="hidden sm:block mt-1 text-sm text-muted-foreground">
          Record one real shopping trip and split its cost across {eligible.length} order{eligible.length === 1 ? '' : 's'}.
        </p>
      </div>

      {ineligibleCount > 0 ? (
        <Card className="border-warning/40 bg-warning/5 p-4 text-sm text-foreground">
          {ineligibleCount} selected order{ineligibleCount === 1 ? ' was' : 's were'} dropped — already batched, cancelled, refunded, or no longer found.
        </Card>
      ) : null}

      <FulfillmentBatchForm orders={eligible} />
    </div>
  );
}
