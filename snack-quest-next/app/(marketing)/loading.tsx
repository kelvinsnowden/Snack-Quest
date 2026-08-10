import { PageShell } from '@/components/marketing/design/PageShell';

/**
 * Shown the instant a marketing navigation starts (§ CTA
 * responsiveness).
 *
 * There was no `loading.tsx` anywhere under this layout, and the
 * layout is `force-dynamic`, so every tap on a CTA meant a full server
 * round trip — Firestore reads included — with the old page frozen on
 * screen and nothing at all to say the tap had registered. The click
 * felt broken rather than slow, which is worse: people tap again.
 *
 * The frame itself (header, footer) is already on screen from the
 * layout, so this only has to stand in for the page body.
 */
export default function MarketingLoading() {
  return (
    <PageShell>
      <div className="animate-pulse" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading…</span>
        <div className="bg-border/50 mx-auto h-6 w-40 rounded-full" />
        <div className="bg-border/60 mx-auto mt-6 h-12 w-3/4 rounded-2xl" />
        <div className="bg-border/40 mx-auto mt-4 h-5 w-2/3 rounded-full" />
        <div className="mt-12 flex flex-col gap-4">
          <div className="bg-border/30 h-28 rounded-2xl" />
          <div className="bg-border/30 h-28 rounded-2xl" />
          <div className="bg-border/30 h-28 rounded-2xl" />
        </div>
      </div>
    </PageShell>
  );
}
