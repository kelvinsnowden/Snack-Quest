import Image from 'next/image';
import { Compass, Globe2 } from 'lucide-react';
import { Reveal } from '../design/Reveal';

/**
 * `beat: true` marks the short declarative lines that were already
 * the story's own rhythm — a reader skimming just the beats still
 * gets the whole arc.
 *
 * Trimmed to three beats (§ CRO audit — founder story) now that this
 * section sits lower in the funnel, after pricing and how-it-works
 * have already done the persuading: it no longer needs to carry as
 * much weight, just the strongest emotional thread.
 */
const STORY_BEATS: { text: string; beat?: boolean }[] = [
  { text: 'I never planned to start a snack company.', beat: true },
  {
    text: "Working alongside my Chinese colleagues introduced me to a world of snacks I'd never seen before — sometimes they surprised me, sometimes they became an instant favourite.",
  },
  { text: 'That feeling of discovering something unexpected was worth sharing.', beat: true },
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

      <div className="relative mx-auto max-w-6xl">
        <Reveal>
          <p className="text-caption font-bold tracking-[0.3em] text-primary uppercase">Meet the founder</p>
        </Reveal>

        <div className="mt-6 grid items-center gap-10 md:mt-10 md:grid-cols-2 md:gap-20">
          <Reveal>
            {/* 200px is the deliberate mobile size; the two-column grid at
                `md` has room for far more than that, so the photo and its
                decorations scale back up rather than sitting undersized
                and off-center in half the section. 400px matches the cap
                an earlier pass already settled on as right for this
                column width (see git history) — not a new guess. */}
            <div className="relative mx-auto w-full max-w-[200px] md:max-w-[400px]">
              <div
                aria-hidden="true"
                className="absolute -inset-3 rounded-[24px] bg-gradient-to-br from-primary/25 via-home-lime/20 to-secondary/25 blur-2xl md:-inset-5 md:blur-3xl"
              />
              <div className="relative aspect-[4/5] overflow-hidden rounded-[20px] shadow-[0_20px_50px_-20px_rgb(31_31_31/0.3)]">
                {founderImageUrl ? (
                  <Image
                    src={founderImageUrl}
                    alt="Kelvin, founder of Snack Quest, holding a snack box."
                    fill
                    sizes="(min-width: 768px) 400px, 200px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-secondary via-secondary to-home-purple-deep text-center text-white">
                    <span className="flex size-9 items-center justify-center rounded-full bg-white/10 md:size-14">
                      <Compass className="size-4 text-home-lime md:size-6" aria-hidden="true" />
                    </span>
                    <p className="px-4 text-[10px] leading-tight font-semibold tracking-wide text-white/70 uppercase md:text-xs">
                      Founder portrait coming soon
                    </p>
                  </div>
                )}
              </div>

              <div className="absolute top-3 -right-2 hidden items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-secondary shadow-sm md:flex md:top-5 md:-right-4 md:gap-1.5 md:px-3 md:py-1.5 md:text-xs">
                <Globe2 className="size-2.5 md:size-3.5" aria-hidden="true" />
                Curated worldwide
              </div>
              <div
                aria-hidden="true"
                className="absolute top-[-10px] left-[-10px] hidden -rotate-[10deg] items-center rounded-md border border-primary/70 bg-background/95 px-2 py-1 text-[10px] font-bold tracking-wide text-primary uppercase shadow-sm md:flex md:top-[-16px] md:left-[-16px] md:px-3 md:py-1.5 md:text-xs"
              >
                ✈ Nairobi · Founder
              </div>
              <div className="absolute -right-2.5 -bottom-2.5 flex size-9 animate-float-slow items-center justify-center rounded-full bg-foreground shadow-[0_12px_30px_-10px_rgb(255_122_0/0.5)] md:-right-4 md:-bottom-4 md:size-14">
                <Compass className="size-4 text-home-lime md:size-6" aria-hidden="true" />
              </div>
            </div>
          </Reveal>

          <div>
            <Reveal>
              <h2 className="text-balance font-display text-4xl leading-[1] font-normal uppercase md:text-6xl">
                <span className="text-secondary">Why Snack Quest</span> <span className="text-foreground">exists.</span>
              </h2>
            </Reveal>

            {/* A left rail rather than uniform paragraphs stacked flat —
                it gives seven sentences a visible "this is one thread"
                shape instead of reading as an undifferentiated block,
                and each line reveals on its own short stagger as it
                scrolls in rather than dumping the whole story at once. */}
            <div className="border-primary/20 mt-7 flex max-w-[460px] flex-col gap-4 border-l-2 pl-5">
              {STORY_BEATS.map(({ text, beat }, index) => (
                <Reveal key={text} delayMs={index * 70}>
                  <p
                    className={
                      beat
                        ? 'text-foreground text-lg leading-snug font-semibold md:text-xl'
                        : 'text-foreground/70 text-[15px] leading-[1.65] md:text-base'
                    }
                  >
                    {text}
                  </p>
                </Reveal>
              ))}
            </div>

            <Reveal delayMs={STORY_BEATS.length * 70 + 40}>
              <div className="border-border mt-7 max-w-[460px] border-t pt-6">
                <p className="text-foreground text-lg font-semibold md:text-xl">
                  That&apos;s why I created Snack Quest.
                </p>
                <p className="text-foreground/70 mt-3 text-[15px] leading-[1.65] md:text-base">
                  Today, every snack in a Snack Quest box has been personally tasted and selected — because I want
                  you to feel that same sense of discovery.
                </p>
              </div>
            </Reveal>

            <Reveal delayMs={STORY_BEATS.length * 70 + 120}>
              <div className="mt-8">
                <p className="font-signature text-3xl text-secondary italic md:text-4xl">Kelvin</p>
                <p className="mt-1 text-caption font-semibold tracking-[0.25em] text-foreground/60 uppercase">
                  Founder, Snack Quest
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
