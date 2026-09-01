import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { REFERRAL_COOKIE_NAME, resolveReferralCode } from '@/lib/creators/referralCookie';
import { packageRepository } from '@/repositories/packageRepository';
import { deliveryZoneRuleRepository } from '@/repositories/deliveryZoneRuleRepository';
import { guaranteedPickCountFor } from '@/lib/packages/guaranteedPicks';
import { isOfferExpired } from '@/lib/packages/offerExpiry';
import { CheckoutForm, type CheckoutBox } from '@/components/checkout/CheckoutForm';
import { ResumePaymentBanner } from '@/components/checkout/ResumePaymentBanner';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';

/**
 * `/checkout?box=<packageId>` (§ Website Becomes the Primary Commerce
 * Channel) — the website's purchase flow, and the destination every
 * WhatsApp "buy" conversation now links to rather than trying to take
 * an order in the thread.
 *
 * A Server Component that does nothing but hand the client a list of
 * real, active boxes. It computes no totals: the price shown next to
 * each box is the catalog price for the customer to read, and the
 * amount actually charged is whatever `POST /api/checkout/web`
 * calculates server-side when they submit. The frontend stays thin by
 * construction — it has no pricing code to keep in sync.
 */
export const metadata: Metadata = buildPageMetadata({
  title: 'Checkout',
  description: 'Choose your Snack Quest box, tell us where to send it, and pay with M-Pesa.',
  path: '/checkout',
});

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ box?: string; ref?: string }>;
}) {
  const { box: requestedBoxId, ref: refParam } = await searchParams;
  const businessId = getCurrentBusinessId();

  // `?ref=` when the visitor arrived from a creator's link just now,
  // the cookie when they arrived from one earlier and browsed first.
  const cookieStore = await cookies();
  const referralCode = resolveReferralCode(refParam, cookieStore.get(REFERRAL_COOKIE_NAME)?.value);

  const active = await packageRepository.listActive(businessId);

  /*
   * The cheapest delivery on offer, so the box step can say what the
   * real total starts at (§ show delivery before the last step).
   *
   * The advertised price excludes delivery, so a customer committed to
   * "KES 2,500" and then watched it become 2,750 once they picked a
   * station — the single moment 214 checkout visits produced almost no
   * completed delivery selections. Naming the floor up front turns a
   * late increase into something they already knew.
   *
   * Read from `deliveryZoneRules`, the same collection the charge is
   * priced from, never from `FARGO_SEED_FEES_KES` — that constant
   * documents itself as seed data and not the figure charged. Failing
   * softly to null hides the line rather than risking a wrong price.
   */
  const deliveryFromKes = await deliveryZoneRuleRepository
    .listByBusiness(businessId)
    .then((rules) => {
      // `feeKes` is nullable on purpose — a zone with no rate card
      // entered yet has no fee, and this codebase refuses to invent
      // one. Those zones simply do not participate in the minimum.
      const fees = rules
        .map(({ data }) => data.feeKes)
        .filter((fee): fee is number => typeof fee === 'number' && fee > 0);
      return fees.length > 0 ? Math.min(...fees) : null;
    })
    .catch(() => null);

  // `listActive()` deliberately excludes the exit-intent rescue offer
  // (§ exit-intent rescue offer) — it must never appear in this
  // page's general box grid. But a visitor arriving via the offer's
  // own `?box=<id>` link still needs to land on a working checkout
  // for it, so it's fetched and spliced in only when it's the box
  // actually being requested, active, and not expired.
  let rescueBox: { id: string; data: NonNullable<Awaited<ReturnType<typeof packageRepository.findById>>> } | null =
    null;
  if (requestedBoxId && !active.some(({ id }) => id === requestedBoxId)) {
    const candidate = await packageRepository.findById(businessId, requestedBoxId);
    if (candidate?.isRescueOffer && candidate.isActive && !isOfferExpired(candidate.offerExpiresAt)) {
      rescueBox = { id: requestedBoxId, data: candidate };
    }
  }

  const boxes: CheckoutBox[] = [...active, ...(rescueBox ? [rescueBox] : [])].map(({ id, data }) => ({
    id,
    name: data.name,
    description: data.description,
    priceKes: data.priceKes,
    imageUrl: data.imageUrl,
    // Undefined means untracked/unlimited (see types/package.ts) — not
    // zero, which would render every box as sold out.
    stockCount: data.stockCount ?? null,
    snackCountLabel: data.snackCountLabel ?? null,
    isRescueOffer: data.isRescueOffer ?? false,
    guaranteedPickCount: guaranteedPickCountFor(data),
    highlightLabel: data.highlightLabel ?? null,
  }));

  // Tighter on a phone than a marketing page would be: a hero-sized
  // title and a two-line strapline were eating close to half of the
  // first screen on a page whose entire job is to be filled in. The
  // full treatment returns at `sm`, where there's room for it.
  return (
    <div className="mx-auto max-w-3xl px-5 py-7 sm:px-6 sm:py-16 lg:px-8">
      <header>
        <h1 className="text-foreground text-2xl font-bold tracking-tight sm:text-[length:var(--text-page-title)]">
          Checkout
        </h1>
        <p className="text-muted-foreground mt-2 text-sm sm:mt-3 sm:text-base">
          Pick your box, tell us where to send it, and pay with M-Pesa. It takes about a minute.
        </p>
      </header>

      <div className="mt-7 sm:mt-10">
        <ResumePaymentBanner />
        <CheckoutForm
          boxes={boxes}
          initialBoxId={requestedBoxId ?? null}
          initialReferralCode={referralCode}
          deliveryFromKes={deliveryFromKes}
        />
      </div>
    </div>
  );
}
