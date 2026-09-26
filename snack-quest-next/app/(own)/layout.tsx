import { PageViewTracker } from '@/components/marketing/analytics/PageViewTracker';

/**
 * The machine-owner landing page's own chrome (§ machine-owner
 * lead-generation landing page) — mirrors `(invest)/layout.tsx`
 * exactly: its own route group, own navigation, no shop header and no
 * ad pixels tuned for snack-purchase optimisation, which would
 * degrade on traffic that isn't shopping for snacks at all.
 */
export const dynamic = 'force-dynamic';

export default function OwnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background flex min-h-full flex-col">
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
