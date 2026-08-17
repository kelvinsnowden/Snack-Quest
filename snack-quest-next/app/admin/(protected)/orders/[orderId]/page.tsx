import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { orderRepository } from '@/repositories/orderRepository';
import { shipmentRepository } from '@/repositories/shipmentRepository';
import { refundRepository } from '@/repositories/refundRepository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { isOrderBatchable } from '@/lib/fulfillmentBatches/eligibility';
import { OrderStatusBadge } from '@/components/admin/OrderStatusBadge';
import { OrderStatusActions } from '@/components/admin/OrderStatusActions';
import { RefundActions } from '@/components/admin/RefundActions';
import { RefundStatusBadge } from '@/components/admin/RefundStatusBadge';
import { formatDateTime, formatKes, formatOrderNumber } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Order detail' };

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const session = await requireStaffSession();
  const { orderId } = await params;

  const order = await orderRepository.findById(orderId);
  if (!order || order.businessId !== session.businessId) {
    notFound();
  }

  const [items, shipment, refunds] = await Promise.all([
    orderRepository.listItems(orderId),
    shipmentRepository.findByOrderId(orderId),
    refundRepository.listByOrderId(session.businessId, orderId),
  ]);

  const { customer, delivery, payment, pricing, product } = order;
  const canInitiateRefund =
    order.status === 'refund_requested' &&
    !refunds.some(({ data }) => data.status === 'processing' || data.status === 'succeeded');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/admin/orders"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Orders
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-page-title font-bold tracking-tight text-foreground">
              {order.orderNumber !== undefined ? formatOrderNumber(order.orderNumber) : product.packageLabel}
            </h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {product.packageLabel} · Placed {formatDateTime(order.createdAt)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <OrderStatusActions orderId={orderId} status={order.status} />
          {canInitiateRefund ? <RefundActions orderId={orderId} /> : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow label="Name" value={customer.customerName || 'Guest'} />
            <DetailRow label="Phone number" value={<span className="tabular-nums">{customer.phoneNumber}</span>} />
            <DetailRow label="County" value={customer.county} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow
              label="M-Pesa receipt"
              value={<span className="tabular-nums">{payment.mpesaReceiptNumber ?? '—'}</span>}
            />
            <DetailRow label="Payment intent" value={<span className="text-xs tabular-nums">{payment.paymentIntentId}</span>} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Delivery</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow label="Method" value={delivery.method === 'pickup' ? 'Pickup station' : 'Door delivery'} />
            <DetailRow label="Provider" value={<span className="capitalize">{delivery.provider}</span>} />
            <DetailRow label="Status" value={<span className="capitalize">{delivery.status.replace(/_/g, ' ')}</span>} />
            <DetailRow label="Fee" value={formatKes(delivery.feeKes)} />
            {delivery.method === 'pickup' ? (
              <DetailRow label="Pickup station" value={delivery.pickupStationName ?? '—'} />
            ) : (
              <>
                <DetailRow label="Address" value={delivery.addressText ?? '—'} />
                <DetailRow label="Landmark" value={delivery.landmark ?? '—'} />
                <DetailRow label="Contact phone" value={delivery.contactPhone ?? '—'} />
              </>
            )}
            {delivery.trackingUrl ? (
              <DetailRow
                label="Tracking"
                value={
                  <a href={delivery.trackingUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    View
                  </a>
                }
              />
            ) : null}
            {shipment ? (
              <DetailRow label="Shipment status" value={<span className="capitalize">{shipment.data.status.replace(/_/g, ' ')}</span>} />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow label="Subtotal" value={formatKes(pricing.subtotalKes)} />
            <DetailRow label="Discount" value={`-${formatKes(pricing.discountKes)}`} />
            <DetailRow label="Delivery fee" value={formatKes(pricing.deliveryFeeKes)} />
            <DetailRow label="Credits used" value={`-${formatKes(pricing.creditsUsedKes)}`} />
            <DetailRow label="Total" value={<span className="text-base">{formatKes(pricing.totalKes)}</span>} />
          </CardContent>
        </Card>
      </div>

      {items.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {items.map((item, index) => (
              <DetailRow
                key={`${item.packageId}-${index}`}
                label={`${item.packageLabel} × ${item.quantity}`}
                value={formatKes(item.unitCostKes * item.quantity)}
              />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {refunds.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Refunds</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {refunds.map(({ id, data }) => (
              <div key={id} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                <div>
                  <RefundStatusBadge status={data.status} />
                  <span className="ml-2 text-muted-foreground">{formatDateTime(data.createdAt)}</span>
                </div>
                <span className="font-medium tabular-nums text-foreground">{formatKes(data.amountKes)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {order.fulfillment ? (
        <Card>
          <CardHeader>
            <CardTitle>Fulfillment</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow
              label="Batch"
              value={
                <Link href={`/admin/fulfillment-batches/${order.fulfillmentBatchId}`} className="text-primary hover:underline">
                  View batch
                </Link>
              }
            />
            <DetailRow label="Allocated cost" value={formatKes(order.fulfillment.allocatedCostKes)} />
            <DetailRow
              label="Estimated profit"
              value={
                <span className={order.fulfillment.estimatedProfitKes < 0 ? 'text-danger' : undefined}>
                  {formatKes(order.fulfillment.estimatedProfitKes)}
                </span>
              }
            />
          </CardContent>
        </Card>
      ) : isOrderBatchable(order.status, order.fulfillmentBatchId) ? (
        <Card>
          <CardHeader>
            <CardTitle>Fulfillment</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-0">
            {/* Silence here used to read as "no cost", which is the one
                thing it never means — this order's revenue is counted
                but nothing has been spent against it on paper yet. */}
            <p className="text-sm text-muted-foreground">
              No shopping trip has been costed against this order yet, so its profit is unknown — not zero. It
              appears under uncosted orders in Finance until a batch covers it.
            </p>
            <div>
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/fulfillment-batches/new">Record a batch</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {order.statusReason ? (
        <Card>
          <CardHeader>
            <CardTitle>Latest status note</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground">{order.statusReason}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
