import { Card } from '@/components/ui/card';
import { OrderPackingList } from '@/components/warehouse/OrderPackingList';
import { RecordCostsForm } from '@/components/warehouse/RecordCostsForm';
import { CollectPaymentButton } from '@/components/warehouse/CollectPaymentButton';
import { MarkDispatchedButton } from '@/components/warehouse/MarkDispatchedButton';
import { Phone } from 'lucide-react';
import { DeliveryTarget } from '@/components/warehouse/DeliveryTarget';
import { formatDate, formatOrderNumber } from '@/lib/orders/format';
import { CompleteBoxForm } from '@/components/warehouse/CompleteBoxForm';
import { orderBoxSummary, orderLines } from '@/types/checkoutLine';
import type { Order } from '@/types';

/**
 * One order, on the phone of the person fulfilling it
 * (§ Warehouse workspace).
 *
 * A card rather than a table row, because this screen is used on a
 * phone in a room with boxes in it. The table this replaced put the
 * customer's name and the action button off the side of a 390px
 * screen behind a horizontal scroll, which is a fine way to lay out a
 * spreadsheet and a poor way to lay out a job.
 *
 * The order is the unit of work, so everything about it is here: what
 * goes in the boxes, where it is going, what is still owed, what it
 * cost, and the one action that moves it on. Nothing is a link to
 * somewhere else — a packer with a box in one hand should not be
 * navigating.
 */
export function FulfilmentOrderCard({
  orderId,
  order,
  stage,
  sourcingNotes,
}: {
  orderId: string;
  order: Order;
  /** `pack` is still in the building; `out` is with the customer's courier. */
  stage: 'pack' | 'out';
  /** Where to buy each snack, by snack id — see `OrderPackingList`. */
  sourcingNotes?: Map<string, string | null>;
}) {
  const { customer, delivery, pricing, payment, product, costs } = order;
  const outstandingKes = payment?.dueOnDelivery ? pricing.totalKes : 0;
  const curatedCount = orderLines(product).reduce(
    (sum, line) => sum + (line.curatedSnacks?.length ?? 0),
    0,
  );

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          {/*
            The reference a customer says on the phone, so it is the
            first thing here rather than something only Admin knows.
          */}
          <span className="text-foreground font-semibold tabular-nums">
            {order.orderNumber !== undefined ? formatOrderNumber(order.orderNumber) : 'Order'}
          </span>
          <span className="text-muted-foreground shrink-0 text-caption tabular-nums">
            {formatDate(order.createdAt)}
          </span>
        </div>
        <span className="text-foreground text-sm">{customer.customerName || 'Guest'}</span>
        {/* Dials. The point of doing this on a phone. */}
        <a
          href={`tel:${customer.phoneNumber}`}
          className="text-foreground hover:text-primary flex w-fit items-center gap-2 text-sm tabular-nums underline-offset-4 hover:underline"
        >
          <Phone className="size-4 shrink-0" aria-hidden="true" />
          {customer.phoneNumber}
        </a>
      </div>

      {/*
        Photographs while it is being packed, since that is when the
        packets have to be found. Once it is out for delivery the boxes
        are sealed and the rider only needs to know what they are
        carrying, so it collapses to the summary.
      */}
      {stage === 'pack' ? (
        <OrderPackingList product={product} sourcingNotes={sourcingNotes} />
      ) : (
        <span className="text-foreground text-sm font-medium">{orderBoxSummary(product)}</span>
      )}

      <div className="border-border flex flex-col gap-2 border-t pt-3">
        <DeliveryTarget delivery={delivery} orderPhone={customer.phoneNumber} />
        {/*
          Two different sums, and confusing them costs real money: the
          whole order is unpaid, or only the courier's fee is.
        */}
        {outstandingKes > 0 ? (
          <span className="text-warning text-sm font-semibold">
            Unpaid — collect KES {outstandingKes.toLocaleString()}
          </span>
        ) : null}
        {delivery.feeCollection === 'on_delivery' ? (
          <span className="text-warning text-sm font-semibold">
            Collect KES {delivery.feeKes.toLocaleString()} delivery fee on delivery
          </span>
        ) : null}
      </div>

      {/*
        The rest of what goes in the box (§ staff complete the box).
        Only while it is still being packed — once it is sealed and
        out for delivery there is nothing left to decide, and the
        record is what it is.
      */}
      {stage === 'pack' ? (
        <details className="border-border rounded-lg border p-3">
          <summary className="text-foreground cursor-pointer text-sm font-medium">
            {curatedCount > 0
              ? `Completed the box — ${curatedCount} ${curatedCount === 1 ? 'snack' : 'snacks'} added`
              : 'Add the rest of the box'}
          </summary>
          <div className="mt-3">
            <CompleteBoxForm
              orderId={orderId}
              boxes={orderLines(product).map((line, lineIndex) => ({
                lineIndex,
                packageLabel: line.packageLabel,
                quantity: line.quantity,
                promisedCount: (line.guaranteedPicks ?? product.guaranteedPicks ?? []).length,
                curatedSnackIds: (line.curatedSnacks ?? []).map((snack) => snack.snackItemId),
              }))}
            />
          </div>
        </details>
      ) : null}

      {/*
        What it cost, entered by the only person who knows
        (§ fulfilment records the real cost). On the card rather than
        behind a link, because it is recorded in the same minute as the
        packing it describes.
      */}
      <details className="border-border rounded-lg border p-3" open={stage === 'out' && !costs}>
        <summary className="text-foreground cursor-pointer text-sm font-medium">
          {costs
            ? `Cost recorded — KES ${(costs.goodsCostKes + costs.otherCostKes).toLocaleString()}`
            : 'Record what this cost'}
        </summary>
        <div className="mt-3">
          <RecordCostsForm
            orderId={orderId}
            revenueKes={pricing.totalKes}
            existing={
              costs
                ? {
                    goodsCostKes: costs.goodsCostKes,
                    otherCostKes: costs.otherCostKes,
                    note: costs.note,
                  }
                : null
            }
          />
          {costs ? (
            <p className="text-muted-foreground mt-2 text-caption">
              Last entered by {costs.recordedByName}.
            </p>
          ) : null}
        </div>
      </details>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {/*
          The money before the button that closes the job. An order
          marked done with payment outstanding is one nobody goes back
          for.
        */}
        {outstandingKes > 0 ? (
          <CollectPaymentButton
            orderId={orderId}
            amountKes={outstandingKes}
            phoneNumber={customer.phoneNumber}
          />
        ) : null}
        <MarkDispatchedButton
          orderId={orderId}
          to={stage === 'pack' ? 'dispatched' : 'delivered'}
          deliveryMethod={delivery.method}
          outstandingKes={outstandingKes}
        />
      </div>
    </Card>
  );
}
