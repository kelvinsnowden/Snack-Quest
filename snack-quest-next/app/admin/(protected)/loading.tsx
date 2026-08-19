import { Skeleton } from '@/components/ui/skeleton';

/**
 * Shown while an admin page's server-side reads are in flight
 * (§ Admin mobile UX overhaul).
 *
 * Every admin page is an async Server Component that reads Firestore
 * before it can render anything, and there was no loading boundary
 * anywhere in the portal — so on a slow mobile connection tapping a nav
 * item did nothing visible until the whole page arrived. On a phone
 * that reads as a dead tap, and the usual response is to tap again.
 *
 * Deliberately generic: a header block and a few rows, matching the
 * shape almost every admin page actually has (title, then a filter
 * card, then a list). It exists to prove the tap registered and to hold
 * the layout still, not to impersonate any particular page.
 */
export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>

      <Skeleton className="h-24 w-full rounded-lg" />

      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-20 w-full rounded-xl md:h-14" />
        ))}
      </div>
    </div>
  );
}
