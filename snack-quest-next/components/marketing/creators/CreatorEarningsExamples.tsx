import { Calculator } from 'lucide-react';
import { formatKes } from '@/lib/orders/format';
import { CREATOR_COMMISSION_KES } from '@/lib/creators/referralEconomics';
import { Reveal } from '../design/Reveal';

/**
 * "What could you earn?" (§ Creator Program CRO pass, brief item 3) —
 * KES 300 is easy to state and hard to picture. This makes the
 * multiplication visible instead of leaving a visitor to do it in
 * their head, which is exactly the kind of small friction that loses
 * an otherwise-interested creator.
 *
 * Every figure is `orders * CREATOR_COMMISSION_KES`, computed here
 * rather than typed, so it can never drift from the real rate — and
 * the disclaimer is load-bearing, not boilerplate: these are
 * arithmetic examples of a real, fixed per-order rate, never a
 * forecast or a promise of how many orders a creator will actually
 * generate.
 */
const ORDER_COUNTS = [1, 5, 10, 25, 50, 100] as const;

export function CreatorEarningsExamples() {
  return (
    <section className="bg-background px-5 py-16 md:px-10 md:py-32">
      <Reveal>
        <div className="mx-auto max-w-xl text-center">
          <p className="text-caption text-secondary font-bold tracking-[0.3em] uppercase">
            The math
          </p>
          <h2 className="font-display mt-4 text-4xl leading-[1.05] font-normal text-balance uppercase md:text-6xl">
            What could you earn?
          </h2>
          <p className="text-foreground/70 mx-auto mt-5 max-w-md text-base md:text-lg">
            Every successful order earns you {formatKes(CREATOR_COMMISSION_KES)}. Here&apos;s
            what that adds up to.
          </p>
        </div>
      </Reveal>

      <Reveal delayMs={150}>
        <div className="mx-auto mt-10 grid max-w-4xl grid-cols-2 gap-3 md:mt-16 md:grid-cols-3 md:gap-4">
          {ORDER_COUNTS.map((orders) => (
            <div
              key={orders}
              className="border-border bg-surface flex flex-col items-center gap-1 rounded-2xl border p-5 text-center md:p-7"
            >
              <p className="text-caption text-foreground/60 font-bold tracking-wide uppercase">
                {orders} {orders === 1 ? 'order' : 'orders'}
              </p>
              <p className="font-display text-3xl leading-[1] font-normal text-secondary uppercase md:text-4xl">
                {formatKes(orders * CREATOR_COMMISSION_KES)}
              </p>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal delayMs={220}>
        <p className="text-foreground/50 mx-auto mt-6 flex max-w-md items-start justify-center gap-2 text-center text-sm md:mt-10">
          <Calculator className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Mathematical examples of a fixed per-order rate — not a forecast or a guarantee of what
          you&apos;ll sell.
        </p>
      </Reveal>
    </section>
  );
}
