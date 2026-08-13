import { Fragment } from 'react';
import { Award, ArrowRight, BarChart3, Megaphone, ShoppingBag } from 'lucide-react';
import { Reveal } from '../design/Reveal';

const JOURNEY = [
  { icon: Megaphone, label: 'Campaigns' },
  { icon: ShoppingBag, label: 'Sales' },
  { icon: BarChart3, label: 'Results' },
  { icon: Award, label: 'Portfolio' },
] as const;

/**
 * What a creator walks away with beyond commission (§ founder story
 * integration, replacing the earlier "For beginners too" section) —
 * every claim is about what a creator's *own, real* Snack Quest
 * results can become evidence of, never a promise that joining alone
 * produces brand deals or more revenue. "Can become" / "can show",
 * never "will get you".
 */
export function CreatorPortfolio() {
  return (
    <section className="bg-background px-5 py-16 md:px-10 md:py-32">
      <Reveal>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-caption text-secondary font-bold tracking-[0.3em] uppercase">Build your portfolio</p>
          <h2 className="font-display mt-4 text-4xl leading-[1.05] font-normal text-balance uppercase md:text-6xl">
            Don&apos;t just earn from Snack Quest.{' '}
            <span className="text-secondary">Build proof of what you can do.</span>
          </h2>
          <p className="text-foreground/70 mx-auto mt-5 max-w-[512px] text-base md:text-lg">
            You&apos;re not just promoting a product. <span className="text-foreground font-semibold">You&apos;re building a track record.</span>
          </p>
        </div>
      </Reveal>

      <Reveal delayMs={150}>
        <div className="border-border bg-surface mx-auto mt-10 max-w-3xl rounded-3xl border p-7 md:mt-16 md:p-10">
          <p className="text-foreground/70 text-[15px] leading-[1.65] md:text-base">
            Every sale and result you generate can become part of a portfolio you show other brands later.
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <p className="text-foreground/50 text-sm line-through decoration-1">
              &ldquo;I think I can help you sell.&rdquo;
            </p>
            <div className="border-primary/30 bg-primary/5 rounded-xl border p-4">
              <p className="text-caption text-primary/80 font-bold tracking-wide uppercase">You can show them</p>
              <p className="text-foreground mt-1 text-lg font-semibold md:text-xl">
                &ldquo;Here&apos;s what I did for Snack Quest.&rdquo;
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-stretch gap-2 md:flex-row md:items-center">
            {JOURNEY.map((step, index) => (
              <Fragment key={step.label}>
                <div className="border-border bg-white flex flex-col items-center gap-1.5 rounded-2xl border p-4 text-center md:flex-1">
                  <step.icon className="text-secondary size-5" strokeWidth={2.2} aria-hidden="true" />
                  <p className="text-small text-foreground font-semibold">{step.label}</p>
                </div>
                {index < JOURNEY.length - 1 ? (
                  <ArrowRight
                    className="text-foreground/30 mx-auto size-4 shrink-0 rotate-90 md:rotate-0"
                    aria-hidden="true"
                  />
                ) : null}
              </Fragment>
            ))}
          </div>

          <p className="text-foreground mt-7 text-lg font-semibold md:text-xl">
            Snack Quest can be your first case study.
            <br />
            It doesn&apos;t have to be your last.
          </p>
        </div>
      </Reveal>
    </section>
  );
}
