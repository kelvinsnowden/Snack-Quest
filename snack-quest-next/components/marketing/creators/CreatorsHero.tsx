import Link from 'next/link';
import { ArrowRight, Coins, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatKes } from '@/lib/orders/format';
import { CREATOR_COMMISSION_KES } from '@/lib/creators/referralEconomics';
import { Reveal } from '../design/Reveal';
import { PRIMARY_CTA_CLASS, GHOST_CTA_CLASS } from '../design/ctaStyles';

/**
 * The Creator Program hero, built in the home page's language rather
 * than the admin-panel language this page used to be written in (§
 * brand consistency pass). Same typographic hero, same drifting brand
 * washes, same dashed expedition trail, same `Reveal` cadence — this is
 * the first page a prospective creator sees, and it was a heading and
 * three grey cards on a blank background.
 *
 * Every number on this page is the real one from
 * `referralEconomics.ts`, not marketing rounding.
 */
export function CreatorsHero() {
  return (
    <section className="bg-background relative overflow-hidden px-5 py-16 md:px-10 md:py-32">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="bg-secondary/25 absolute -top-32 -left-32 size-[500px] rounded-full blur-3xl" />
        <div className="bg-primary/20 absolute top-40 -right-32 size-[420px] rounded-full blur-3xl" />
        <svg
          className="absolute inset-0 size-full opacity-[0.12]"
          viewBox="0 0 800 800"
          preserveAspectRatio="none"
          fill="none"
        >
          <path
            d="M40 720 C 220 600, 340 520, 420 430 S 620 240, 790 60"
            stroke="var(--color-foreground)"
            strokeWidth="2"
            strokeDasharray="2 10"
          />
          <circle cx="40" cy="720" r="6" fill="var(--color-secondary)" />
          <circle cx="790" cy="60" r="6" fill="var(--color-primary)" />
        </svg>
      </div>

      <div className="relative mx-auto max-w-3xl text-center">
        <Reveal>
          <div className="border-foreground/10 text-caption text-foreground/70 inline-flex items-center gap-2 rounded-full border bg-white/70 px-4 py-1.5 font-semibold tracking-wide uppercase backdrop-blur-sm">
            <Sparkles className="text-secondary size-3.5" aria-hidden="true" />
            Creator program
          </div>
        </Reveal>

        <Reveal delayMs={120}>
          <h1 className="font-display mt-6 text-[clamp(2.5rem,7.5vw,5rem)] leading-[0.9] font-normal tracking-tight text-balance uppercase">
            <span className="text-foreground">Get paid for </span>
            <span className="text-secondary">introducing</span>
            <span className="text-foreground"> people to </span>
            <span className="text-primary">Snack Quest.</span>
          </h1>
        </Reveal>

        <Reveal delayMs={200}>
          <p className="text-subtitle text-foreground/75 mx-auto mt-6 max-w-xl">
            Share your link, and every order it brings in earns you{' '}
            <span className="text-foreground font-semibold">
              {formatKes(CREATOR_COMMISSION_KES)}
            </span>
            . No minimum following, nothing to pay, no waiting for approval.
          </p>
        </Reveal>

        <Reveal delayMs={300}>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className={PRIMARY_CTA_CLASS}>
              <Link href="/creator/register">
                Become a creator
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg" className={GHOST_CTA_CLASS}>
              <Link href="/creator/login">Already a creator? Sign in</Link>
            </Button>
          </div>

          <div className="text-small text-foreground/70 mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <span className="inline-flex items-center gap-1.5">
              <Coins className="text-primary size-4" aria-hidden="true" />
              {formatKes(CREATOR_COMMISSION_KES)} per order
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Zap className="text-secondary size-4" aria-hidden="true" />
              Credited instantly
            </span>
            <span className="inline-flex items-center gap-1.5">💸 Withdraw to M-Pesa</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
