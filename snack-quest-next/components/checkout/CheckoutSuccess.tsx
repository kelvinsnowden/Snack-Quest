import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatKes, formatOrderNumber } from '@/lib/orders/format';
import { buildWhatsAppOrderUrl } from '@/lib/whatsapp/orderLink';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import type { WebCheckoutStatusResponse } from '@/types/webCheckout';

/**
 * The order confirmation (§ Website Becomes the Primary Commerce
 * Channel). A Server Component — by the time it renders, the payment
 * has already succeeded and the order exists, so there is nothing left
 * to poll or react to.
 *
 * The Bolt call to action appears only for door delivery, and it is a
 * real next step rather than a courtesy link: the website deliberately
 * did not charge for Bolt, so arranging the rider over WhatsApp is how
 * that order actually gets delivered. Pickup orders don't get it —
 * their courier is already booked.
 */
export function CheckoutSuccess({ status }: { status: WebCheckoutStatusResponse }) {
  const isDoorDelivery = status.deliveryMethod === 'door';
  // The real, sequential order number once one exists (it always does
  // by the time this renders) — the raw id/session-id fallback only
  // covers the split second before an order predating this field would
  // have shown something, and is never expected to actually fire.
  const orderRef =
    status.orderNumber !== null
      ? formatOrderNumber(status.orderNumber)
      : (status.orderId?.slice(0, 8) ?? status.checkoutSessionId.slice(0, 8)).toUpperCase();

  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <span className="bg-success/10 text-success flex size-20 items-center justify-center rounded-full">
        <CheckCircle2 className="size-10" aria-hidden="true" />
      </span>

      <div className="flex flex-col gap-3">
        <h1 className="text-page-title text-foreground font-bold tracking-tight">
          {status.customerName ? `Thank you, ${status.customerName.split(' ')[0]}!` : 'Payment received!'}
        </h1>
        <p className="text-muted-foreground text-base">
          Your payment went through and your order is confirmed. We&apos;ve sent the details to your WhatsApp too.
        </p>
      </div>

      <div className="border-border bg-surface w-full rounded-lg border p-6">
        <dl className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground text-sm">Order reference</dt>
            <dd className="text-foreground font-mono text-sm font-medium">{orderRef}</dd>
          </div>
          {status.packageLabel ? (
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground text-sm">Box</dt>
              <dd className="text-foreground text-sm font-medium">{status.packageLabel}</dd>
            </div>
          ) : null}
          {status.totalKes !== null ? (
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground text-sm">Paid</dt>
              <dd className="text-foreground text-lg font-semibold">{formatKes(status.totalKes)}</dd>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground text-sm">Delivery</dt>
            <dd className="text-foreground text-sm font-medium">
              {isDoorDelivery ? 'Nairobi door delivery' : 'Jumia pickup station'}
            </dd>
          </div>
        </dl>
      </div>

      {isDoorDelivery ? (
        <div className="border-primary/30 bg-primary/5 flex w-full flex-col gap-4 rounded-lg border p-6 text-left">
          <div>
            <p className="text-foreground text-sm font-semibold">One more step: arrange your Bolt rider</p>
            <p className="text-muted-foreground mt-2 text-sm">
              Your Snack Quest order is paid for. Bolt delivery is arranged separately — message us and we&apos;ll
              book the rider. The fare is quoted for your trip and paid directly to the rider on arrival.
            </p>
          </div>
          <Button asChild size="lg">
            <a
              href={buildWhatsAppOrderUrl(
                `Hi! I've paid for order ${orderRef} and I'd like to arrange Bolt delivery.`,
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              <WhatsAppIcon className="size-4" />
              Arrange Bolt Delivery on WhatsApp
            </a>
          </Button>
        </div>
      ) : (
        <div className="flex w-full flex-col items-center gap-4">
          <p className="text-muted-foreground text-sm">
            We&apos;ll let you know on WhatsApp as soon as your box reaches your pickup station.
          </p>
          <Button asChild variant="outline" size="lg">
            <a
              href={buildWhatsAppOrderUrl(`Hi! I've paid for order ${orderRef} and wanted to check in.`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <WhatsAppIcon className="size-4" />
              Message us about {orderRef}
            </a>
          </Button>
        </div>
      )}

      <Button asChild variant="outline" size="lg">
        <Link href="/boxes">Browse more boxes</Link>
      </Button>
    </div>
  );
}
