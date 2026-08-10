/**
 * The checkout skeleton (§ CTA responsiveness).
 *
 * Its own rather than the group's, because this is where every "Buy
 * now" lands and it is the one navigation on the site that must never
 * feel uncertain — a customer who taps buy and sees nothing happen
 * assumes the shop is broken, and that doubt costs an order.
 *
 * Shaped like the real form (box rows, then fields, then the pay bar)
 * so the page settles into place rather than jumping when it arrives.
 */
export default function CheckoutLoading() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-7 sm:px-6 sm:py-16 lg:px-8">
      <div className="animate-pulse" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading checkout…</span>

        <div className="bg-border/60 h-8 w-40 rounded-lg" />
        <div className="bg-border/40 mt-3 h-4 w-72 max-w-full rounded-full" />

        <div className="mt-7 flex flex-col gap-2.5 sm:mt-10 sm:grid sm:grid-cols-3">
          <div className="bg-border/30 h-20 rounded-xl sm:h-44" />
          <div className="bg-border/30 h-20 rounded-xl sm:h-44" />
          <div className="bg-border/30 h-20 rounded-xl sm:h-44" />
        </div>

        <div className="mt-8 flex flex-col gap-4">
          <div className="bg-border/30 h-11 rounded-md" />
          <div className="bg-border/30 h-11 rounded-md" />
          <div className="bg-border/30 h-24 rounded-xl" />
        </div>

        <div className="bg-border/40 mt-8 h-12 rounded-full" />
      </div>
    </div>
  );
}
