import { Skeleton } from '@/components/ui/skeleton';

/**
 * Shown the moment an owner taps to another page, while its numbers load.
 * Without it the portal had no loading boundary at all, so a tap did
 * nothing visible until the whole next page arrived — on a phone that reads
 * as a dead tap. The header and tab bar stay put; this fills the page area.
 */
export default function PartnerLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
