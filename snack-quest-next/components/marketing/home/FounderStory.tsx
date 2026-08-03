import Image from 'next/image';
import Link from 'next/link';
import { Compass, Globe2, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '../design/Reveal';
import { PRIMARY_CTA_CLASS } from '../design/ctaStyles';

const STORY_PARAGRAPHS = [
  'I never planned to start a snack company.',
  "Working alongside my Chinese colleagues introduced me to a world of snacks I'd never seen before. Every time they handed me something new, I had no idea what to expect.",
  'Sometimes the flavours completely surprised me.',
  'Sometimes they became instant favourites.',
  'That feeling of discovering something unexpected was exciting and I realized it would be nice to offer the same experience to someone else.',
];

/**
 * The page's first photograph (§ spec §7.1) — `founderImageUrl` is
 * `null` until a real portrait is uploaded (see Admin > Storage); this
 * renders a warm, on-brand illustrated panel instead of a fabricated
 * stand-in photo of a named real person, and swaps to the real image
 * the instant a URL is provided. No code change needed once it lands.
 */
export function FounderStory({ founderImageUrl }: { founderImageUrl: string | null }) {
  return (
    <section className="relative overflow-hidden bg-background px-5 py-16 md:px-10 md:py-32">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden md:block">
        <div className="absolute -top-32 -right-24 size-[420px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 size-[420px] rounded-full bg-secondary/10 blur-3xl" />
      </div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2 md:gap-20">
        <Reveal>
          <div className="relative mx-auto w-full max-w-[560px]">
            <div
              aria-hidden="true"
              className="absolute -inset-6 rounded-[40px] bg-gradient-to-br from-primary/25 via-home-lime/20 to-secondary/25 blur-2xl"
            />
            <div className="relative aspect-[4/5] overflow-hidden rounded-[32px] shadow-[0_30px_80px_-30px_rgb(31_31_31/0.3)]">
              {founderImageUrl ? (
                <Image
                  src={founderImageUrl}
                  alt="Kelvin, founder of Snack Quest, holding a mystery box."
                  fill
                  sizes="(min-width: 768px) 50vw, 100vw"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-secondary via-secondary to-home-purple-deep text-center text-white">
                  <span className="flex size-16 items-center justify-center rounded-full bg-white/10">
                    <Compass className="size-8 text-home-lime" aria-hidden="true" />
                  </span>
                  <p className="max-w-[220px] px-6 text-caption font-semibold tracking-wide text-white/70 uppercase">
                    Founder portrait coming soon
                  </p>
                </div>
              )}
            </div>

            <div className="absolute top-6 -right-4 hidden items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-caption font-semibold text-secondary shadow-sm md:flex">
              <Globe2 className="size-3.5" aria-hidden="true" />
              Curated worldwide
            </div>
            <div
              aria-hidden="true"
              className="absolute top-[-20px] left-[-20px] hidden -rotate-[10deg] items-center rounded-lg border-2 border-primary/70 bg-background/95 px-3 py-1.5 text-caption font-bold tracking-wide text-primary uppercase shadow-sm md:flex"
            >
              ✈ Nairobi · Founder
            </div>
            <div className="absolute -right-5 -bottom-5 flex size-16 animate-float-slow items-center justify-center rounded-full bg-foreground shadow-[0_20px_60px_-15px_rgb(255_122_0/0.5)]">
              <Compass className="size-7 text-home-lime" aria-hidden="true" />
            </div>
          </div>
        </Reveal>

        <div>
          <Reveal>
            <p className="text-caption font-bold tracking-[0.3em] text-primary uppercase">Meet the founder</p>
            <h2 className="mt-4 text-balance font-display text-4xl leading-[1] font-normal uppercase md:text-6xl">
              <span className="text-secondary">Why Snack Quest</span> <span className="text-foreground">exists.</span>
            </h2>
          </Reveal>

          <Reveal delayMs={120}>
            <div className="mt-7 flex max-w-[520px] flex-col gap-4 text-[15px] leading-[1.65] text-foreground/80 md:text-lg">
              {STORY_PARAGRAPHS.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              <p className="font-semibold text-foreground">That&apos;s why I created Snack Quest.</p>
              <p>
                Today, every snack that makes it into a Snack Quest box has been personally tasted and carefully
                selected, because I want every customer to experience that same excitement, curiosity and
                unforgettable sense of discovery.
              </p>
            </div>
          </Reveal>

          <Reveal delayMs={220}>
            <div className="mt-8">
              <p className="font-signature text-3xl text-secondary italic md:text-4xl">Kelvin</p>
              <p className="mt-1 text-caption font-semibold tracking-[0.25em] text-foreground/60 uppercase">
                Founder, Snack Quest
              </p>
            </div>
          </Reveal>

          <Reveal delayMs={340}>
            <Button asChild size="lg" className={`mt-8 ${PRIMARY_CTA_CLASS}`}>
              <Link href="#boxes">
                <Rocket className="size-5" aria-hidden="true" />
                Start Your Snack Quest
              </Link>
            </Button>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
