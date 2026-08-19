import { Compass } from 'lucide-react';
import { BuyNowButton } from '@/components/marketing/BuyNowButton';
import { Reveal } from '../design/Reveal';

export function FinalCta({ packageId }: { packageId?: string } = {}) {
  return (
    <section className="bg-home-purple-deep relative overflow-hidden px-5 py-16 text-white md:px-10 md:py-40">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="bg-secondary/40 absolute -top-40 left-1/2 size-[500px] -translate-x-1/2 rounded-full blur-3xl" />
        <div className="bg-primary/30 absolute -right-20 -bottom-20 size-[400px] rounded-full blur-3xl" />
        <svg
          className="absolute inset-0 size-full opacity-10"
          viewBox="0 0 800 400"
          preserveAspectRatio="none"
          fill="none"
        >
          <path
            d="M40 380 C 250 320, 400 200, 760 30"
            stroke="white"
            strokeWidth="2"
            strokeDasharray="2 12"
          />
        </svg>
      </div>

      <div className="relative mx-auto max-w-3xl text-center">
        <Reveal>
          <Compass
            className="text-primary mx-auto size-10"
            strokeWidth={2}
            aria-hidden="true"
          />
        </Reveal>

        <Reveal delayMs={150}>
          <h2 className="font-display mt-6 text-5xl leading-[1] font-normal text-balance uppercase md:text-7xl">
            Ready for
            <br />
            your next <span className="text-home-lime">adventure?</span>
          </h2>
        </Reveal>

        <Reveal delayMs={250}>
          <p className="mx-auto mt-6 max-w-xl text-base text-white/70 md:text-lg">
            2 minutes to order. 24–48 hours to your door. Happiness guaranteed.
          </p>
        </Reveal>

        <Reveal delayMs={350}>
          <div className="mt-10">
            <BuyNowButton
              packageId={packageId}
              size="lg"
              className="animate-pulse-glow from-primary to-home-orange-glow rounded-full bg-gradient-to-br px-8 text-lg"
              analyticsSource="home_final_cta"
            >
              Start your quest
            </BuyNowButton>
          </div>

          <p className="text-small mt-8 tracking-[0.3em] text-white/60 uppercase">
            Mystery · Curiosity · Adventure · Delivered
          </p>
        </Reveal>
      </div>
    </section>
  );
}
