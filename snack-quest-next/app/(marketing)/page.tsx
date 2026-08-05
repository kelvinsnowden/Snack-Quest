import type { Metadata } from 'next';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { getCurrentBusiness } from '@/lib/business/currentBusiness';
import { packageRepository } from '@/repositories/packageRepository';
import { faqRepository } from '@/repositories/faqRepository';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { HomeHero } from '@/components/marketing/home/HomeHero';
import { FounderStory } from '@/components/marketing/home/FounderStory';
import { WhatsInside } from '@/components/marketing/home/WhatsInside';
import { TheRoute } from '@/components/marketing/home/TheRoute';
import { PickYourBox } from '@/components/marketing/home/PickYourBox';
import { FinalCta } from '@/components/marketing/home/FinalCta';
import { FaqSection } from '@/components/marketing/home/FaqSection';
import { MobileStickyBar } from '@/components/marketing/home/MobileStickyBar';
import { FloatingWhatsAppBubble } from '@/components/marketing/home/FloatingWhatsAppBubble';

export const metadata: Metadata = buildPageMetadata({
  title: "Snack Quest, Kenya's Mystery Snack Adventure",
  description:
    'Hand-picked mystery snacks from Japan, Korea, China & Thailand, delivered across Kenya in 24–48 hours. Order on WhatsApp in 2 minutes.',
  path: '/',
});

export default async function MarketingHomePage() {
  const businessId = getCurrentBusinessId();
  const [business, packages, faqs] = await Promise.all([
    getCurrentBusiness(),
    packageRepository.listActive(businessId),
    // The whole homepage must never 500 because the FAQ section's own
    // query failed (e.g. a missing Firestore index) — worst case the
    // section just doesn't render, same as when there are genuinely
    // no FAQs yet.
    faqRepository.listActive(businessId).catch(() => []),
  ]);
  const featured = packages.slice(0, 3);
  const homepageContent = business?.homepageContent;

  return (
    <div className="flex flex-col overflow-x-hidden">
      <HomeHero />
      <WhatsInside photoUrl={homepageContent?.whatsInsidePhotoUrl ?? null} />
      <FounderStory
        founderImageUrl={homepageContent?.founderImageUrl ?? null}
      />
      <PickYourBox packages={featured} />
      <TheRoute />
      <FinalCta />
      <FaqSection faqs={faqs.map((entry) => entry.data)} />

      <MobileStickyBar />
      <FloatingWhatsAppBubble />
    </div>
  );
}
