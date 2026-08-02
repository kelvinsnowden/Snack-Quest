import { Skeleton } from '@/components/ui/skeleton';
import { PortalCard } from '@/components/creator/design/PortalCard';

/**
 * Mirrors the real referrals layout element for element — heading,
 * then link cards each with a code row, a URL row and a stat row — so
 * the swap to real content shifts nothing. Two placeholder cards
 * rather than one: a creator with links is the common case, and a
 * single card would collapse the page height on load and then jump.
 */
export default function CreatorReferralsLoading() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-3 h-4 w-full max-w-md" />
        </div>
        <Skeleton className="h-10 w-36 shrink-0" />
      </header>

      <div className="flex flex-col gap-4">
        {[0, 1].map((i) => (
          <PortalCard key={i} className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-28" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-6 w-11 rounded-full" />
            </div>
            <Skeleton className="h-11 w-full" />
            <div className="border-border flex flex-wrap gap-x-8 gap-y-3 border-t pt-4">
              {[0, 1, 2, 3].map((j) => (
                <div key={j}>
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mt-2 h-5 w-20" />
                </div>
              ))}
            </div>
          </PortalCard>
        ))}
      </div>
    </div>
  );
}
