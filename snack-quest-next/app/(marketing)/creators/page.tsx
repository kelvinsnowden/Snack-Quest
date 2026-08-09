import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { CreatorsHero } from '@/components/marketing/creators/CreatorsHero';
import { CreatorPerks } from '@/components/marketing/creators/CreatorPerks';
import { CreatorRoute } from '@/components/marketing/creators/CreatorRoute';
import { CreatorsFinalCta } from '@/components/marketing/creators/CreatorsFinalCta';

export const metadata: Metadata = buildPageMetadata({
  title: 'Creator Program',
  description:
    'Share your Snack Quest link and earn KES 300 on every order it brings in, credited instantly and withdrawable to M-Pesa. Free to join, no minimum following.',
  path: '/creators',
});

/**
 * The Creator Program landing page — the first thing anyone sees after
 * tapping "Creator program", and now built from the same vocabulary as
 * the home page (§ brand consistency pass) rather than the generic
 * card-on-grey-background it was.
 *
 * Thin by construction, exactly like `app/(marketing)/page.tsx`: four
 * section components in order, no logic. The commission and discount
 * figures inside them are read from `referralEconomics.ts`, so this
 * page can never quote a rate the platform no longer pays.
 */
export default function CreatorsPage() {
  return (
    <div className="flex flex-col overflow-x-hidden">
      <CreatorsHero />
      <CreatorPerks />
      <CreatorRoute />
      <CreatorsFinalCta />
    </div>
  );
}
