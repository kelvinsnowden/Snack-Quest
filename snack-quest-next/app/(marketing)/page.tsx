import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { getCurrentBusiness } from '@/lib/business/currentBusiness';
import { packageRepository } from '@/repositories/packageRepository';
import { snackItemRepository } from '@/repositories/snackItemRepository';
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
import { HomeBodyFallback } from '@/components/marketing/home/HomeBodyFallback';

export const metadata: Metadata = buildPageMetadata({
  // No brand name here: the root layout's title template already
  // appends "| Snack Quest", so naming it again rendered "Snack Quest,
  // Explore World Snack Flavours in Kenya | Snack Quest" in search
  // results — the brand twice in one line, on the one result that
  // matters most.
  title: 'Explore World Snack Flavours in Kenya',
  description:
    'Explore hand-picked snack flavours from Japan, Korea, China & Thailand. Choose the snacks you want, discover the rest. Delivered across Kenya in 24–48 hours, paid by M-Pesa.',
  path: '/',
});

/**
 * The page component is deliberately NOT async (§ mobile LCP).
 *
 * It used to be, and that was the whole performance problem. Every
 * section lived after one `await Promise.all([...])` of five Firestore
 * queries, so nothing rendered until the slowest of them came back —
 * and because `loading.tsx` wraps this route, what shipped in the
 * meantime was a pulsing grey skeleton. The hero, which needs no data
 * at all, was waiting on a review count and an FAQ list to appear.
 *
 * Measured on the live HTML before this change: the response contained
 * the loading skeleton and not one byte of hero markup. The LCP
 * element is the hero's `<h1>`, so LCP could not happen until Firestore
 * answered. That is the 5.6s.
 *
 * Now the hero, the sticky bar and the WhatsApp bubble are outside the
 * data path entirely and flush in the first chunk of HTML. Everything
 * that genuinely needs data sits behind one Suspense boundary and
 * streams in after, which is what Suspense is for.
 *
 * One boundary rather than one per section on purpose: the sections
 * share queries (packages feeds both the box picker and the "from"
 * price), so splitting them would either duplicate reads or need a
 * caching layer to avoid it. A single boundary keeps the existing
 * parallel `Promise.all` exactly as it was.
 */
export default function MarketingHomePage() {
  return (
    <div className="flex flex-col overflow-x-hidden">
      <HomeHero />

      <Suspense fallback={<HomeBodyFallback />}>
        <HomeBody />
      </Suspense>

      <MobileStickyBar />
      <FloatingWhatsAppBubble />
    </div>
  );
}

/**
 * Everything below the hero that reads from Firestore.
 *
 * The static sections between them (`PartnersMarquee`, `TheRoute`,
 * `FinalCta`) stay here rather than being hoisted out: they sit
 * *between* data-driven sections, so lifting them would reorder the
 * page. They cost nothing to render and are not what anyone is
 * waiting for.
 */
async function HomeBody() {
  const businessId = getCurrentBusinessId();
  const [business, packages, faqs, reviews, snacks] = await Promise.all([
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
    // Same reasoning again: a failed snack query degrades the
    // "What's inside" section back to the single flat-lay rather than
    // breaking the homepage.
    snackItemRepository.listWithImages(businessId).catch(() => []),
  ]);
  const featured = packages.slice(0, 3);
  const homepageContent = business?.homepageContent;

  return (
    <>
      <WhatsInside
        photoUrl={homepageContent?.whatsInsidePhotoUrl ?? null}
        snacks={snacks.map(({ id, data }) => ({
          id,
          name: data.name,
          origin: data.origin,
          // Narrowed by `listWithImages`, which only returns rows that
          // actually have one.
          imageUrl: data.imageUrl as string,
        }))}
        fromPriceKes={featured.length > 0 ? Math.min(...featured.map((p) => p.data.priceKes)) : null}
      />
      <PickYourBox packages={featured} />
      {/*
        Social proof now runs right after the box picker, not the hero
        — a visitor should see what they'd actually be buying before
        being asked to trust other people's reactions to it. Renders
        nothing when there are no published reviews yet, so this is a
        no-op until real ones exist.
      */}
      <ReviewsSection
        reviews={reviews.reviews}
        totalCount={reviews.totalCount}
        averageRating={reviews.averageRating}
        ratingCounts={reviews.ratingCounts}
      />
      <PartnersMarquee label="M-Pesa accepted · Door delivery in Nairobi · Fargo pickup countrywide" />
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
    </>
  );
}
