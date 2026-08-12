import { Smartphone, X, Sparkles } from 'lucide-react';
import { Reveal } from '../design/Reveal';

const NOT_NEEDED = ['A shop', 'A warehouse', 'Inventory', 'An office', 'A laptop'];

/**
 * The low-barrier claim, immediately balanced by the effort caveat (§
 * founder story integration) — the two live in the same visual block on
 * purpose, so "start with your phone" is never read on its own as "and
 * that's all it takes." First-commission framing stays deliberately
 * promise-free: no amount, no guarantee, just "proof it can be done."
 */
export function CreatorStartHere() {
  return (
    <section className="bg-white px-5 py-16 md:px-10 md:py-32">
      <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-2 md:gap-16">
        <Reveal>
          <div>
            <p className="text-caption text-secondary font-bold tracking-[0.3em] uppercase">Your starting point</p>
            <h2 className="font-display mt-4 text-3xl leading-[1.05] font-normal text-balance uppercase md:text-5xl">
              Already in your hand.
            </h2>

            <ul className="mt-6 flex flex-col gap-2.5">
              {NOT_NEEDED.map((item) => (
                <li key={item} className="text-small text-foreground/60 flex items-center gap-2.5 line-through">
                  <X className="size-4 shrink-0 text-foreground/30" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>

            <p className="text-foreground mt-6 flex items-center gap-2.5 text-lg font-semibold md:text-xl">
              <Smartphone className="text-secondary size-5 shrink-0" aria-hidden="true" />
              Your phone — and the willingness to learn.
            </p>

            <div className="border-primary/30 bg-primary/5 mt-6 rounded-2xl border p-4">
              <p className="text-small text-foreground/70">
                A low barrier to start doesn&apos;t mean a low barrier to results. You&apos;ll still need to learn,
                post, test, improve and put in the work.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal delayMs={150}>
          <div className="border-border bg-surface flex h-full flex-col justify-center rounded-3xl border p-7 md:p-10">
            <Sparkles className="text-primary size-6" aria-hidden="true" />
            <h3 className="font-display mt-4 text-2xl leading-[1.1] font-normal uppercase md:text-3xl">
              Your first commission is more than money.
            </h3>
            <p className="text-foreground/70 mt-3 text-[15px] leading-[1.65] md:text-base">
              If you&apos;ve never made money online before, your first commission — whatever it is — proves
              something: that it can be done.
            </p>
            <p className="text-foreground/70 mt-3 text-[15px] leading-[1.65] md:text-base">
              I won&apos;t promise you a number, and I won&apos;t promise it&apos;ll be quick. But that first proof
              matters more than people expect.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
