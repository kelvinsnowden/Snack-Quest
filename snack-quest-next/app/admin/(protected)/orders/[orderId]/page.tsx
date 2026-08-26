import type { Metadata } from 'next';
import type { ManualPaymentMethod } from '@/types';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { CorrectManualPaymentDialog } from '@/components/admin/CorrectManualPaymentDialog';
import { orderRepository } from '@/repositories/orderRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { ChangeOrderBoxDialog } from '@/components/admin/ChangeOrderBoxDialog';
import { SendConfirmationSmsButton } from '@/components/admin/SendConfirmationSmsButton';
import { outboundMessageRepository } from '@/repositories/outboundMessageRepository';
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
import { orderBoxSummary } from '@/types/checkoutLine';

export const metadata: Metadata = { title: 'Order detail' };

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

/** Mirrors `ManualPaymentMethod` — kept here rather than imported so this display copy reads for a human, not for a database. */
const MANUAL_PAYMENT_LABELS: Record<ManualPaymentMethod, string> = {
  cash: 'Cash',
  mpesa_manual: 'M-Pesa (sent by customer)',
  bank_transfer: 'Bank transfer',
};

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

  const [items, shipment, refunds, boxes, confirmationSms] = await Promise.all([
    orderRepository.listItems(orderId),
    shipmentRepository.findByOrderId(orderId),
    refundRepository.listByOrderId(session.businessId, orderId),
    // Only needed for the super-admin box-correction control; an empty
    // list just hides it rather than failing the page.
    packageRepository.listActive(session.businessId).catch(() => []),
    // Whether the confirmation text has already gone out — the send is
    // deduped on this exact id, so its presence is the whole answer.
    outboundMessageRepository.findById(`sms:order-confirmed:${orderId}`).catch(() => null),
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
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              {order.orderNumber !== undefined ? formatOrderNumber(order.orderNumber) : orderBoxSummary(product)}
            </h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {orderBoxSummary(product)} · Placed {formatDateTime(order.createdAt)}
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
            {/* Only when there is one — the field is optional at checkout and absent on every WhatsApp order, so an empty "Email —" row would be noise on most orders. */}
            {customer.email ? (
              <DetailRow
                label="Email"
                value={
                  <a href={`mailto:${customer.email}`} className="text-primary hover:underline">
                    {customer.email}
                  </a>
                }
              />
            ) : null}
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
            {/*
              An order settled outside Daraja says so plainly, and says
              who vouched for it. Without this the Payment card would
              show an em-dash receipt and look like a Daraja payment
              that lost its callback — the one confusion that matters
              when the books are being checked.
            */}
            {payment.manualPayment ? (
              <>
                <DetailRow
                  label="Recorded as paid"
                  value={
                    <span className="text-warning font-medium">
                      {MANUAL_PAYMENT_LABELS[payment.manualPayment.method]}
                      {payment.manualPayment.reference ? ` · ${payment.manualPayment.reference}` : ''}
                    </span>
                  }
                />
                <DetailRow label="Recorded by" value={payment.manualPayment.recordedByName} />
                {payment.manualPayment.note ? (
                  <DetailRow label="Note" value={payment.manualPayment.note} />
                ) : null}
                {/*
                  Shown whenever it exists. A corrected record that
                  looks identical to one entered right the first time
                  is the thing that makes books untrustworthy — anyone
                  checking these figures should be able to see that a
                  human changed them, and who.
                */}
                {payment.manualPayment.correctedByName ? (
                  <DetailRow
                    label="Corrected by"
                    value={
                      <span className="text-muted-foreground">
                        {payment.manualPayment.correctedByName}
                        {payment.manualPayment.correctedAt
                          ? ` · ${formatDateTime(payment.manualPayment.correctedAt)}`
                          : ''}
                      </span>
                    }
                  />
                ) : null}
              </>
            ) : null}
            <DetailRow label="Payment intent" value={<span className="text-xs tabular-nums">{payment.paymentIntentId}</span>} />
            {/*
              Super admin only, the same gate recording one has: this
              is the one payment whose evidence is a person's word, so
              asserting it and amending it are the same privilege.
            */}
            {/*
              Only for an order recorded by hand. Those do not text
              automatically, so this is the send — and the one control
              that would otherwise be missing entirely.
            */}
            {payment.manualPayment ? (
              <SendConfirmationSmsButton
                orderId={orderId}
                alreadySent={confirmationSms !== null}
                phoneNumber={customer.phoneNumber}
              />
            ) : null}
            {payment.manualPayment && isSuperAdmin(session) ? (
              <CorrectManualPaymentDialog
                orderId={orderId}
                currentMethod={payment.manualPayment.method}
                currentReference={payment.manualPayment.reference}
                currentNote={payment.manualPayment.note}
              />
            ) : null}
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
            {/*
              Only when the two disagree, which only happens after the
              box on a paid order was changed. Its absence is the
              normal case and means "paid exactly the total".
            */}
            {typeof pricing.amountPaidKes === 'number' && pricing.amountPaidKes !== pricing.totalKes ? (
              <>
                <DetailRow label="Actually paid" value={formatKes(pricing.amountPaidKes)} />
                <DetailRow
                  label={pricing.amountPaidKes < pricing.totalKes ? 'Customer owes' : 'Refund due'}
                  value={
                    <span className="text-warning font-medium">
                      {formatKes(Math.abs(pricing.amountPaidKes - pricing.totalKes))}
                    </span>
                  }
                />
              </>
            ) : null}
            {isSuperAdmin(session) && boxes.length > 0 ? (
              <ChangeOrderBoxDialog
                orderId={orderId}
                boxes={boxes.map(({ id, data }) => ({ id, name: data.name, priceKes: data.priceKes }))}
                currentPackageId={product.packageId}
                currentQuantity={items.reduce((sum, item) => sum + item.quantity, 0) || 1}
                amountPaidKes={pricing.amountPaidKes ?? pricing.totalKes}
                deliveryFeeKes={pricing.deliveryFeeKes}
                discountKes={pricing.discountKes}
                creditsUsedKes={pricing.creditsUsedKes}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/*
        The packing list's whole point (§ Premium: choose 5, discover
        the rest). Stated as a floor rather than the contents — the
        rest of the box is still curated, and a packer reading this as
        "the box contains these five" would ship a worse box.
      */}
      {product.guaranteedPicks?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Guaranteed picks — must be in this box</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="divide-border divide-y">
              {product.guaranteedPicks.map((pick, index) => (
                <li key={pick.snackItemId} className="flex items-baseline gap-3 py-2 text-sm">
                  <span className="text-muted-foreground w-4 shrink-0 tabular-nums">{index + 1}.</span>
                  <span className="text-foreground font-medium">{pick.name}</span>
                  {pick.origin ? (
                    <span className="text-muted-foreground ml-auto">{pick.origin}</span>
                  ) : null}
                </li>
              ))}
            </ol>
            <p className="text-muted-foreground mt-3 text-sm">
              The rest of the box is curated by Snack Quest as usual.
            </p>
          </CardContent>
        </Card>
      ) : null}

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
