import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatKes, formatOrderNumber } from '@/lib/orders/format';
import { CREATOR_COMMISSION_KES, REFERRAL_DISCOUNT_KES } from '@/lib/creators/referralEconomics';
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
          {/*
            States what the business actually does — packs within 24
            hours, arrives in 24–48, ask us any time — rather than
            promising an automatic "it has arrived" notification. The
            previous copy committed to a message that nothing in this
            codebase sends (§ Mission 2 — no unbacked promises); if that
            update is sent by hand today, this is still true, and it
            gives the customer something they control either way.
          */}
          <p className="text-muted-foreground text-sm text-pretty">
            Your box is packed and sent within 24 hours, and usually reaches the station within 24–48
            hours after that. Message us any time to check where yours is.
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

      {/*
        The one place a genuinely warm creator prospect is standing
        still: someone who has just chosen to spend real money on this
        product (§ Mission 2 — creator discoverability). Deliberately
        placed after the delivery details, styled as a quiet aside
        rather than a second call to action, and carrying only the two
        fixed program facts — no earnings projection, since what any
        individual makes depends entirely on their own audience.
      */}
      <div className="border-border bg-surface w-full rounded-lg border p-5 text-left">
        <p className="text-foreground text-sm font-semibold">Going to post about it?</p>
        <p className="text-muted-foreground mt-1.5 text-sm text-pretty">
          Snack Quest creators get a personal link. Anyone who orders through it gets{' '}
          {formatKes(REFERRAL_DISCOUNT_KES)} off, and you earn {formatKes(CREATOR_COMMISSION_KES)} on
          every order it brings in, paid to M-Pesa. Free to join, no minimum following.
        </p>
        <Link
          href="/creators"
          className="text-primary mt-3 inline-block text-sm font-semibold hover:underline"
        >
          See how the Creator Program works →
        </Link>
      </div>

      <Button asChild variant="outline" size="lg">
        <Link href="/boxes">Browse more boxes</Link>
      </Button>
    </div>
  );
}
