import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { REFERRAL_COOKIE_NAME, resolveReferralCode } from '@/lib/creators/referralCookie';
import { packageRepository } from '@/repositories/packageRepository';
import { CheckoutForm, type CheckoutBox } from '@/components/checkout/CheckoutForm';
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
  const boxes: CheckoutBox[] = active.map(({ id, data }) => ({
    id,
    name: data.name,
    description: data.description,
    priceKes: data.priceKes,
    imageUrl: data.imageUrl,
    // Undefined means untracked/unlimited (see types/package.ts) — not
    // zero, which would render every box as sold out.
    stockCount: data.stockCount ?? null,
    snackCountLabel: data.snackCountLabel ?? null,
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <header>
        <h1 className="text-page-title text-foreground font-bold tracking-tight">Checkout</h1>
        <p className="text-muted-foreground mt-3 text-base">
          Pick your box, tell us where to send it, and pay with M-Pesa. It takes about a minute.
        </p>
      </header>

      <div className="mt-10">
        <CheckoutForm
          boxes={boxes}
          initialBoxId={requestedBoxId ?? null}
          initialReferralCode={referralCode}
        />
      </div>
    </div>
  );
}
