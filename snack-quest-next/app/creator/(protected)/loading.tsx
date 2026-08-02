import { Skeleton } from '@/components/ui/skeleton';
import { PortalCard } from '@/components/creator/design/PortalCard';

/**
 * Mirrors the dashboard element for element — greeting, balance hero,
 * quick-action row, commission list — so the swap to real content
 * shifts nothing. The hero placeholder carries the real card's height
 * and radius rather than a generic block, since it is the tallest
 * thing on the screen and any mismatch there moves everything below.
 */
export default function CreatorHomeLoading() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <header>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-2 h-8 w-40" />
        <div className="mt-3 flex gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </header>

      <Skeleton className="h-[15rem] w-full rounded-2xl md:h-[17rem]" />

      <div className="grid grid-cols-4 gap-2 md:gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex min-h-[5rem] flex-col items-center justify-center gap-2 py-3"
          >
            <Skeleton className="size-11 rounded-full" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>

      <section>
        <Skeleton className="h-6 w-48" />
        <PortalCard className="mt-4 flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-2 h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-16 shrink-0" />
            </div>
          ))}
        </PortalCard>
      </section>
    </div>
  );
}
