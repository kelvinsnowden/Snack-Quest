import Link from 'next/link';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatKes } from '@/lib/orders/format';
import { CREATOR_COMMISSION_KES } from '@/lib/creators/referralEconomics';
import { Reveal } from '../design/Reveal';

/**
 * The closing call to action, matching the home page's own (§ brand
 * consistency pass) — deep purple, blurred brand blooms, a dashed trail
 * heading off the top right, and the same pulsing pill CTA.
 */
export function CreatorsFinalCta() {
  return (
    <section className="bg-home-purple-deep relative overflow-hidden px-5 py-16 text-white md:px-10 md:py-32">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="bg-secondary/40 absolute -top-40 left-1/2 size-[500px] -translate-x-1/2 rounded-full blur-3xl" />
        <div className="bg-primary/30 absolute -right-20 -bottom-20 size-[400px] rounded-full blur-3xl" />
        <svg
          className="absolute inset-0 size-full opacity-10"
          viewBox="0 0 800 400"
          preserveAspectRatio="none"
          fill="none"
        >
          <path d="M40 380 C 250 320, 400 200, 760 30" stroke="white" strokeWidth="2" strokeDasharray="2 12" />
        </svg>
      </div>

      <div className="relative mx-auto max-w-3xl text-center">
        <Reveal>
          <Compass className="text-home-lime mx-auto size-10" strokeWidth={2} aria-hidden="true" />
        </Reveal>

        <Reveal delayMs={150}>
          <h2 className="font-display mt-6 text-4xl leading-[1] font-normal text-balance uppercase md:text-6xl">
            Your next post could
            <br />
            be your <span className="text-home-lime">first payout.</span>
          </h2>
        </Reveal>

        <Reveal delayMs={250}>
          <p className="mx-auto mt-6 max-w-xl text-base text-white/70 md:text-lg">
            {formatKes(CREATOR_COMMISSION_KES)} for every order you send our way. Free to join, and you can
            start sharing the minute you sign up.
          </p>
        </Reveal>

        <Reveal delayMs={350}>
          <div className="mt-10">
            <Button
              asChild
              size="lg"
              className="animate-pulse-glow from-primary to-home-orange-glow rounded-full bg-gradient-to-br px-8 text-lg"
            >
              <Link href="/creator/register">Become a creator</Link>
            </Button>
          </div>

          <p className="text-small mt-6 text-white/60">
            Already signed up?{' '}
            <Link href="/creator/login" className="text-home-lime font-medium underline-offset-4 hover:underline">
              Sign in to your dashboard
            </Link>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
