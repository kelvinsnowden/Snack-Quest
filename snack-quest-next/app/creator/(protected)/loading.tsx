import { Skeleton } from '@/components/ui/skeleton';
import { PortalCard } from '@/components/creator/design/PortalCard';
import { StatTile } from '@/components/creator/design/StatTile';

/**
 * Dashboard loading state (§ Creator Portal premium rebuild).
 *
 * A route-level `loading.tsx` rather than a spinner inside the page:
 * Next streams this instantly while the Firestore read runs, so the
 * shell, navigation and header stay interactive and the screen never
 * blanks between navigations.
 *
 * The skeleton mirrors the real layout element for element — same
 * heading width, same two-column stat grid, same card order — because
 * a skeleton that does not match what replaces it causes the layout
 * shift skeletons exist to avoid.
 */
export default function CreatorHomeLoading() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <header>
        <Skeleton className="h-8 w-64" />
        <div className="mt-3 flex gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </header>

      <section>
        <Skeleton className="h-6 w-40" />
        <div className="mt-4 grid grid-cols-2 gap-3 md:gap-4">
          <StatTile.Loading />
          <StatTile.Loading />
        </div>
      </section>

      <section>
        <Skeleton className="h-6 w-44" />
        <PortalCard className="mt-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-3 h-4 w-full max-w-md" />
        </PortalCard>
      </section>

      <section>
        <Skeleton className="h-6 w-28" />
        <PortalCard className="mt-4">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2 h-5 w-32" />
            </div>
            <div>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-5 w-28" />
            </div>
          </div>
        </PortalCard>
      </section>
    </div>
  );
}
