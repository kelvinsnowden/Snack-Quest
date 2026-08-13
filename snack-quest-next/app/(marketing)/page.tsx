import type { Metadata } from 'next';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { getCurrentBusiness } from '@/lib/business/currentBusiness';
import { packageRepository } from '@/repositories/packageRepository';
import { faqRepository } from '@/repositories/faqRepository';
import { reviewService } from '@/services/reviewService';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { HomeHero } from '@/components/marketing/home/HomeHero';
import { FounderStory } from '@/components/marketing/home/FounderStory';
import { WhatsInside } from '@/components/marketing/home/WhatsInside';
import { TheRoute } from '@/components/marketing/home/TheRoute';
import { PickYourBox } from '@/components/marketing/home/PickYourBox';
import { PartnersMarquee } from '@/components/marketing/PartnersMarquee';
import { FinalCta } from '@/components/marketing/home/FinalCta';
import { FaqSection } from '@/components/marketing/home/FaqSection';
import { ReviewsSection } from '@/components/marketing/home/ReviewsSection';
import { MobileStickyBar } from '@/components/marketing/home/MobileStickyBar';
import { FloatingWhatsAppBubble } from '@/components/marketing/home/FloatingWhatsAppBubble';

export const metadata: Metadata = buildPageMetadata({
  title: "Snack Quest, Kenya's Mystery Snack Adventure",
  description:
    'Hand-picked mystery snacks from Japan, Korea, China & Thailand, delivered across Kenya in 24–48 hours. Order online in 2 minutes and pay with M-Pesa.',
  path: '/',
});

export default async function MarketingHomePage() {
  const businessId = getCurrentBusinessId();
  const [business, packages, faqs, reviews] = await Promise.all([
    getCurrentBusiness(),
    packageRepository.listActive(businessId),
    // The whole homepage must never 500 because the FAQ section's own
    // query failed (e.g. a missing Firestore index) — worst case the
    // section just doesn't render, same as when there are genuinely
    // no FAQs yet.
    faqRepository.listActive(businessId).catch(() => []),
    // Same reasoning, and the same shape a genuinely empty result
    // takes — `ReviewsSection` renders nothing for an empty list, so a
    // failed query degrades to exactly "no reviews yet" rather than a
    // broken page.
    reviewService
      .listPublished(businessId, 9)
      .catch(() => ({ reviews: [], totalCount: 0, averageRating: 0, ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } })),
  ]);
  const featured = packages.slice(0, 3);
  const homepageContent = business?.homepageContent;

  return (
    <div className="flex flex-col overflow-x-hidden">
      <HomeHero />
      {/*
        Social proof moved up to run right after the hero (§ CRO audit
        — funnel order): real customer photos and reviews are stronger,
        earlier trust evidence than an illustrated founder placeholder,
        and a visitor deciding whether to keep scrolling should see
        other people's reactions before being asked to read anyone's
        origin story. Renders nothing when there are no published
        reviews yet, so this is a no-op until real ones exist.
      */}
      <ReviewsSection
        reviews={reviews.reviews}
        totalCount={reviews.totalCount}
        averageRating={reviews.averageRating}
        ratingCounts={reviews.ratingCounts}
      />
      <WhatsInside photoUrl={homepageContent?.whatsInsidePhotoUrl ?? null} />
      <PickYourBox packages={featured} />
      <PartnersMarquee label="M-Pesa accepted · Jumia pickup countrywide · Bolt door delivery" />
      <TheRoute />
      {/*
        Founder story moved below pricing and how-it-works (§ CRO
        audit) — trust and authenticity still matter, but they no
        longer need to carry the visitor's attention before they've
        even seen what a box costs or how ordering works.
      */}
      <FounderStory
        founderImageUrl={homepageContent?.founderImageUrl ?? null}
      />
      <FinalCta />
      <FaqSection faqs={faqs.map((entry) => entry.data)} />

      <MobileStickyBar />
      <FloatingWhatsAppBubble />
    </div>
  );
}
