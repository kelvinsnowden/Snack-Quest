import { PageViewTracker } from '@/components/marketing/analytics/PageViewTracker';

/**
 * The investor page's own chrome (§ investor interest page).
 *
 * A separate route group from `(marketing)` on purpose. That layout
 * wraps every page in the shop header — Boxes, How it works, a Buy now
 * button — and someone deciding whether to have a funding
 * conversation should not be looking at a checkout CTA. The page
 * brings its own navigation instead, with one prominent action.
 *
 * Reuses the existing first-party page-view tracker rather than adding
 * a second analytics system. The Meta and TikTok ad pixels from the
 * marketing layout are deliberately not carried over: they exist to
 * optimise for snack purchases, and feeding investor traffic into that
 * signal would degrade the shop's ad targeting while telling us
 * nothing useful about this page.
 */
export const dynamic = 'force-dynamic';

export default function InvestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-[#120c22]">
      <PageViewTracker />
      <a
        href="#main-content"
        className="focus:bg-primary focus:text-primary-foreground sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
    </div>
  );
}
