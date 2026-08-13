import type { Metadata } from 'next';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { getCurrentBusiness } from '@/lib/business/currentBusiness';
import { packageRepository } from '@/repositories/packageRepository';
import { productService } from '@/services/productService';
import { faqRepository } from '@/repositories/faqRepository';
import { reviewService } from '@/services/reviewService';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { HomeHero } from '@/components/marketing/home/HomeHero';
import { FounderStory } from '@/components/marketing/home/FounderStory';
import { WhatsInside } from '@/components/marketing/home/WhatsInside';
import { TheRoute } from '@/components/marketing/home/TheRoute';
import { PickYourBox } from '@/components/marketing/home/PickYourBox';
import { FinalCta } from '@/components/marketing/home/FinalCta';
import { FaqSection } from '@/components/marketing/home/FaqSection';
import { ReviewsSection } from '@/components/marketing/home/ReviewsSection';
import { MobileStickyBar } from '@/components/marketing/home/MobileStickyBar';
import { FloatingWhatsAppBubble } from '@/components/marketing/home/FloatingWhatsAppBubble';
import { SetActiveBoxName } from '@/components/marketing/design/ActiveBoxContext';

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Try Snack Quest — From KES 1,500",
    description:
      "Hand-picked mystery snacks from Japan, Korea, China & Thailand, delivered across Kenya in 24–48 hours. Try Snack Quest from KES 1,500.",
    path: '/try',
  }),
  // A campaign landing page, not a page visitors should find through
  // search — kept out of the sitemap for the same reason.
  robots: { index: false, follow: false },
};

/**
 * A pricing-test replica of the home page (`app/(marketing)/page.tsx`)
 * for ad campaigns: same sections in the same order, but the featured
 * lineup swaps the cheapest catalog box for the exit-intent rescue
 * offer, so a visitor arriving here sees KES 1,500 / 3,500 / 5,000
 * instead of the site-wide default. The real home page, its pricing,
 * and every other route are untouched — this is a separate,
 * unlisted URL, not a change to the default catalog.
 *
 * Every primary CTA on this page (hero, sticky bar, final CTA) is
 * pointed at the rescue-offer package id explicitly — the generic
 * `/checkout` a bare `BuyNowButton` falls back to only ever shows the
 * normal catalog (the rescue offer is deliberately excluded from
 * `packageRepository.listActive()` everywhere else), so leaving these
 * un-targeted here would send a visitor who clicks "Buy now" to a
 * checkout that doesn't even offer the KES 1,500 box they came for.
 */
export default async function TryLandingPage() {
  const businessId = getCurrentBusinessId();
  const [business, packages, rescueOffer, faqs, reviews] = await Promise.all([
    getCurrentBusiness(),
    packageRepository.listActive(businessId),
    productService.getRescueOffer(businessId),
    faqRepository.listActive(businessId).catch(() => []),
    reviewService
      .listPublished(businessId, 9)
      .catch(() => ({ reviews: [], totalCount: 0, averageRating: 0, ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } })),
  ]);

  const higherTiers = [...packages].sort((a, b) => a.data.priceKes - b.data.priceKes).slice(1, 3);
  const featured = rescueOffer ? [rescueOffer, ...higherTiers] : packages.slice(0, 3);
  const primaryPackageId = featured[0]?.id;
  const homepageContent = business?.homepageContent;

  return (
    <div className="flex flex-col overflow-x-hidden">
      {featured[0] ? (
        <SetActiveBoxName packageId={featured[0].id} name={featured[0].data.name} />
      ) : null}
      <HomeHero primaryPackageId={primaryPackageId} />
      <WhatsInside photoUrl={homepageContent?.whatsInsidePhotoUrl ?? null} />
      <FounderStory founderImageUrl={homepageContent?.founderImageUrl ?? null} />
      <PickYourBox packages={featured} />
      <ReviewsSection
        reviews={reviews.reviews}
        totalCount={reviews.totalCount}
        averageRating={reviews.averageRating}
        ratingCounts={reviews.ratingCounts}
      />
      <TheRoute />
      <FinalCta packageId={primaryPackageId} />
      <FaqSection faqs={faqs.map((entry) => entry.data)} />

      <MobileStickyBar packageId={primaryPackageId} />
      <FloatingWhatsAppBubble />
    </div>
  );
}
