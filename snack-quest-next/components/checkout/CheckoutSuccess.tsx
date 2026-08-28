import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { formatKes, formatOrderNumber } from '@/lib/orders/format';
import { CREATOR_COMMISSION_KES, REFERRAL_DISCOUNT_KES } from '@/lib/creators/referralEconomics';
import { buildWhatsAppOrderUrl } from '@/lib/whatsapp/orderLink';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { PaymentShell } from './payment/PaymentShell';
import {
  DetailCard,
  DetailRow,
  MpesaMark,
  StatusBadge,
  StatusHeadline,
} from './payment/PaymentParts';
import { SnackBoxHero } from './payment/SnackBoxHero';
import type { WebCheckoutStatusResponse } from '@/types/webCheckout';

/**
 * The order confirmation (§ payment screen rebuild). A Server
 * Component — by the time it renders the payment has succeeded and the
 * order exists, so there is nothing left to poll or react to.
 *
 * Rebuilt as a celebration rather than a receipt: the badge, the
 * display headline and the box artwork are the screen, and the figures
 * sit under them. What did *not* change is everything below the fold —
 * the delivery timeline, the creator invitation. Those are the parts of this page
 * that do actual work, and a redesign that dropped them would trade
 * function for a nicer photograph.
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
  const firstName = status.customerName?.trim().split(/\s+/)[0] ?? null;

  return (
    <PaymentShell>
      <StatusBadge tone="success" />

      <StatusHeadline
        lead="Payment"
        rest="Successful!"
        leadClassName="text-primary"
        restClassName="text-home-lime"
      />

      <p className="mt-4 text-base font-semibold text-[#b98cff]">
        {firstName ? `Yay, ${firstName}! Your snack quest begins now.` : 'Yay! Your snack quest begins now.'}
      </p>
      <p className="mt-1 text-sm text-white/65">We&rsquo;ve received your payment.</p>

      <div className="mt-7 w-full">
        <DetailCard>
          <DetailRow label="Order ID">
            <span className="font-mono">{orderRef}</span>
          </DetailRow>
          {status.totalKes !== null ? (
            <DetailRow label="Amount Paid" valueClassName="text-home-lime">
              {formatKes(status.totalKes)}
            </DetailRow>
          ) : null}
          <DetailRow label="Payment Method">
            <MpesaMark />
          </DetailRow>
          {status.paidAt ? (
            <DetailRow label="Date" valueClassName="text-white/85">
              {formatPaidAt(status.paidAt)}
            </DetailRow>
          ) : null}
        </DetailCard>
      </div>

      <SnackBoxHero className="mt-8" />

      <Link
        href="/boxes"
        className="mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-home-lime text-base font-bold text-black transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0510] focus-visible:outline-none"
      >
        Continue Your Quest
        <ArrowRight className="size-5" aria-hidden="true" />
      </Link>

      {/*
        The mock's second action reads "View My Order". There is no
        customer-facing order page in this product, so the label would
        be a promise the link cannot keep — WhatsApp is where a customer
        actually gets an answer about their order today, and the label
        says so.
      */}
      <a
        href={buildWhatsAppOrderUrl(`Hi! I've paid for order ${orderRef} and wanted to check in.`)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-2 py-2 text-sm font-semibold text-[#b98cff] hover:text-white"
      >
        <WhatsAppIcon className="size-4" />
        Ask about {orderRef}
      </a>

      {/*
        Listed back on the confirmation because the picks are the whole
        reason this box costs more (§ Premium: choose 5, discover the
        rest). Seeing them named is the proof they actually stuck —
        and the surprise line beside them keeps the promise honest
        about what the rest of the box is.
      */}
      {status.guaranteedPicks.length > 0 ? (
        <div className="mt-8 w-full rounded-2xl border border-white/10 bg-white/5 p-5 text-left">
          <p className="text-home-lime text-sm font-bold tracking-wide uppercase">
            Your {status.guaranteedPicks.length} guaranteed picks
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {status.guaranteedPicks.map((pick) => (
              <li key={pick.name} className="flex items-baseline gap-2 text-sm text-white/85">
                <span aria-hidden="true" className="text-home-lime">
                  •
                </span>
                <span>
                  {pick.name}
                  {pick.origin ? <span className="text-white/50"> · {pick.origin}</span> : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-white/60">
            Plus more snacks we&rsquo;ve picked for you — those stay a surprise. 👀
          </p>
        </div>
      ) : null}

      {isDoorDelivery ? (
        <p className="mt-10 text-sm text-pretty text-white/60">
          Your box is packed and sent, and Tushop brings it to the address you gave us.
          We&rsquo;ll text you the waybill number as soon as it&rsquo;s on its way.
        </p>
      ) : (
        <p className="mt-10 text-sm text-pretty text-white/60">
          Your box is packed and sent. We&rsquo;ll text you the Fargo waybill number when
          it&rsquo;s dispatched, and Fargo will let you know once it reaches your pickup point.
        </p>
      )}

      {/*
        The one place a genuinely warm creator prospect is standing
        still: someone who has just chosen to spend real money on this
        product (§ Mission 2 — creator discoverability). A quiet aside
        rather than a second call to action, carrying only the two fixed
        program facts — no earnings projection, since what any
        individual makes depends entirely on their own audience.
      */}
      <div className="mt-6 w-full rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left">
        <p className="text-sm font-bold text-white">Going to post about it?</p>
        <p className="mt-1.5 text-sm text-pretty text-white/65">
          Snack Quest creators get a personal link. Anyone who orders through it gets{' '}
          {formatKes(REFERRAL_DISCOUNT_KES)} off, and you earn {formatKes(CREATOR_COMMISSION_KES)} on every
          order it brings in, paid to M-Pesa. Free to join, no minimum following.
        </p>
        <Link href="/creators" className="mt-3 inline-block text-sm font-bold text-home-lime hover:underline">
          See how the Creator Program works →
        </Link>
      </div>
    </PaymentShell>
  );
}

/**
 * Rendered on the server from an ISO string, with an explicit locale
 * and time zone. Left to the runtime's defaults this formats against
 * whatever the serverless region happens to be — which is Cape Town
 * today — and a Kenyan customer would see a receipt timestamped an
 * hour off their own phone.
 */
function formatPaidAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const day = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Nairobi',
  }).format(date);
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Africa/Nairobi',
  }).format(date);
  return `${day} • ${time}`;
}
