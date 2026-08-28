/**
 * Placeholder for the streamed half of the home page (§ mobile LCP).
 *
 * The hero now flushes in the first chunk of HTML and everything that
 * needs Firestore streams in behind this. That only helps if the swap
 * is invisible, so this reserves height rather than collapsing to
 * nothing: without a reserved block the page would be hero-then-footer
 * for a moment, and the footer would jump down the instant the real
 * sections arrived. The report this work is measured against has
 * CLS at 0 and it has to stay there.
 *
 * The height is deliberately approximate. It cannot match the real
 * sections exactly, and it does not need to: this sits below the fold
 * on a phone, so anything that happens here is off-screen and scores
 * nothing, and a visitor who scrolls straight down meets a filling
 * page rather than a footer that runs away from them.
 *
 * `aria-hidden` because the accessible announcement belongs on one
 * element, and `loading.tsx` already owns it for this route.
 */
export function HomeBodyFallback() {
  return (
    <div
      aria-hidden="true"
      className="min-h-[140vh] animate-pulse px-5 py-16 md:px-10 md:py-24"
    >
      <div className="mx-auto max-w-5xl">
        <div className="bg-border/50 h-8 w-56 rounded-full" />
        <div className="bg-border/40 mt-4 h-4 w-full max-w-md rounded-full" />

        <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-border/30 aspect-square rounded-2xl" />
          ))}
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-border/30 h-72 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
