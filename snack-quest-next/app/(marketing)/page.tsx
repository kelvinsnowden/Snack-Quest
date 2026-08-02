import type { Metadata } from 'next';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { getCurrentBusiness } from '@/lib/business/currentBusiness';
import { packageRepository } from '@/repositories/packageRepository';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { HomeHero } from '@/components/marketing/home/HomeHero';
import { FounderStory } from '@/components/marketing/home/FounderStory';
import { WhatsInside } from '@/components/marketing/home/WhatsInside';
import { GiftIt } from '@/components/marketing/home/GiftIt';
import { TheRoute } from '@/components/marketing/home/TheRoute';
import { PickYourBox } from '@/components/marketing/home/PickYourBox';
import { FinalCta } from '@/components/marketing/home/FinalCta';
import { MobileStickyBar } from '@/components/marketing/home/MobileStickyBar';
import { FloatingWhatsAppBubble } from '@/components/marketing/home/FloatingWhatsAppBubble';

export const metadata: Metadata = buildPageMetadata({
  title: "Snack Quest — Kenya's Mystery Snack Adventure",
  description:
    'Hand-picked mystery snacks from Japan, Korea, China & Thailand — delivered across Kenya in 24–48 hours. Order on WhatsApp in 2 minutes.',
  path: '/',
});

/**
 * Real, uploaded photography for the two photo-led sections below —
 * `null` until the business uploads them (Admin > Storage), in which
 * case FounderStory/WhatsInside render an on-brand illustrated panel
 * instead of a fabricated stand-in. Swap these to real Blob URLs the
 * moment the files land; no other change needed.
 */
const FOUNDER_IMAGE_URL: string | null = null;
const WHATS_INSIDE_PHOTO_URL: string | null = null;

export default async function MarketingHomePage() {
  const businessId = getCurrentBusinessId();
  const [business, packages] = await Promise.all([
    getCurrentBusiness(),
    packageRepository.listActive(businessId),
  ]);
  const featured = packages.slice(0, 3);
  const whatsappCustomerNumber = business?.whatsappCustomerNumber ?? null;

  return (
    <div className="flex flex-col overflow-x-hidden">
      <HomeHero whatsappCustomerNumber={whatsappCustomerNumber} />
      <FounderStory founderImageUrl={FOUNDER_IMAGE_URL} />
      <WhatsInside photoUrl={WHATS_INSIDE_PHOTO_URL} />
      <GiftIt whatsappCustomerNumber={whatsappCustomerNumber} />
      <TheRoute />
      <PickYourBox packages={featured} whatsappCustomerNumber={whatsappCustomerNumber} />
      <FinalCta whatsappCustomerNumber={whatsappCustomerNumber} />

      <MobileStickyBar whatsappCustomerNumber={whatsappCustomerNumber} />
      <FloatingWhatsAppBubble whatsappCustomerNumber={whatsappCustomerNumber} />
    </div>
  );
}
