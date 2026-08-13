import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { getCurrentBusiness } from '@/lib/business/currentBusiness';
import { CreatorsHero } from '@/components/marketing/creators/CreatorsHero';
import { PartnersMarquee } from '@/components/marketing/PartnersMarquee';
import { CreatorEconomics } from '@/components/marketing/creators/CreatorEconomics';
import { CreatorEarningsExamples } from '@/components/marketing/creators/CreatorEarningsExamples';
import { CreatorStartHere } from '@/components/marketing/creators/CreatorStartHere';
import { CreatorRoute } from '@/components/marketing/creators/CreatorRoute';
import { CreatorWhatToPost } from '@/components/marketing/creators/CreatorWhatToPost';
import { CreatorPerks } from '@/components/marketing/creators/CreatorPerks';
import { CreatorPortfolio } from '@/components/marketing/creators/CreatorPortfolio';
import { CreatorFounderStory } from '@/components/marketing/creators/CreatorFounderStory';
import { CreatorFaq } from '@/components/marketing/creators/CreatorFaq';
import { CreatorsFinalCta } from '@/components/marketing/creators/CreatorsFinalCta';

export const metadata: Metadata = buildPageMetadata({
  title: 'Creator Program',
  description:
    'Apply to become a Snack Quest creator and earn KES 300 on every order your link brings in. Free to apply, no minimum following, withdraw to M-Pesa.',
  path: '/creators',
});

/**
 * The Creator Program landing page — the first thing anyone sees after
 * tapping "Creator program", and now built from the same vocabulary as
 * the home page (§ brand consistency pass) rather than the generic
 * card-on-grey-background it was.
 *
 * Thin by construction, exactly like `app/(marketing)/page.tsx`: section
 * components in order, no logic. The commission and discount figures
 * inside them are read from `referralEconomics.ts`, so this page can
 * never quote a rate the platform no longer pays. `founderImageUrl`
 * comes from the same `business.homepageContent` field the home page's
 * own `FounderStory` reads — the real founder portrait, never a second
 * asset (§ founder story integration).
 *
 * § Creator Program CRO pass reordered this funnel around the
 * questions a prospective creator actually arrives with — "what's in
 * it for me" before "why did the founder build this" — and added three
 * sections the audit found missing: earnings examples, a "no minimum
 * following" hook, and a content-ideas section. See each component's
 * own doc comment for what changed and why. Deliberately not added: a
 * standalone "real creator proof" section (brief item 11) — this
 * codebase has no real creator testimonials, earnings screenshots, or
 * campaign-result data anywhere, and the brief is explicit that only
 * real proof belongs here, never invented numbers.
 */
export default async function CreatorsPage() {
  const business = await getCurrentBusiness();
  const founderImageUrl = business?.homepageContent?.founderImageUrl ?? null;

  return (
    <div className="flex flex-col overflow-x-hidden">
      <CreatorsHero />
      <PartnersMarquee />
      <CreatorEconomics />
      <CreatorEarningsExamples />
      <CreatorStartHere />
      <CreatorRoute />
      <CreatorWhatToPost />
      <CreatorPerks />
      <CreatorPortfolio />
      <CreatorFounderStory founderImageUrl={founderImageUrl} />
      <CreatorFaq />
      <CreatorsFinalCta />
    </div>
  );
}
