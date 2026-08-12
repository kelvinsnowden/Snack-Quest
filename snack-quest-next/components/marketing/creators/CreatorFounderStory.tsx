import Image from 'next/image';
import { Compass, TrendingUp, Sprout, Megaphone } from 'lucide-react';
import { Reveal } from '../design/Reveal';

/**
 * Why the Creator Program exists, in Kelvin's own voice — not why Snack
 * Quest exists (that's the home page's `FounderStory`). Same visual
 * grammar as that component (photo + short rail of beats) so a visitor
 * who's already seen the home page recognises this as the same founder
 * talking, not a different brand voice grafted onto the creators page.
 *
 * `beat: true` marks the short declarative lines, same convention as
 * home's `FounderStory` — a reader skimming just the bold lines still
 * gets the whole point.
 */
const STORY_BEATS: { text: string; beat?: boolean }[] = [
  { text: 'I need Snack Quest to grow.', beat: true },
  {
    text: "I could spend everything on ads and hope strangers click. Some brands do that.",
  },
  {
    text: 'Instead, I want to grow with people who already have something valuable — an audience that trusts them.',
    beat: true,
  },
  {
    text: 'A lot of small creators have built that audience already. What they often don’t have is a real way to turn it into income.',
  },
];

const REASONS = [
  {
    icon: TrendingUp,
    title: 'Grow Snack Quest',
    body: 'Help more people across Kenya discover Snack Quest — and eventually, beyond.',
  },
  {
    icon: Sprout,
    title: 'Create real opportunities',
    body: "I can't create a thousand jobs. I can create one real opportunity, for someone ready to start.",
  },
  {
    icon: Megaphone,
    title: 'Help creators earn',
    body: 'If you’ve already built an audience, this is a real way to earn from it.',
  },
] as const;

export function CreatorFounderStory({ founderImageUrl }: { founderImageUrl: string | null }) {
  return (
    <section className="relative overflow-hidden bg-background px-5 py-16 md:px-10 md:py-32">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden md:block">
        <div className="absolute -top-32 -left-24 size-[420px] rounded-full bg-secondary/10 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 size-[420px] rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <Reveal>
          <p className="text-caption font-bold tracking-[0.3em] text-secondary uppercase">From the founder</p>
        </Reveal>

        <Reveal delayMs={60}>
          <h2 className="mt-4 max-w-2xl text-balance font-display text-4xl leading-[1.05] font-normal uppercase md:text-6xl">
            Before you promote Snack Quest, <span className="text-secondary">read this.</span>
          </h2>
        </Reveal>

        <Reveal delayMs={100}>
          <p className="mt-3 text-base text-foreground/60 italic md:text-lg">Not a policy page. Me, talking to you.</p>
        </Reveal>

        <div className="mt-10 grid items-center gap-10 md:mt-14 md:grid-cols-2 md:gap-20">
          <Reveal delayMs={150}>
            <div className="relative mx-auto w-full max-w-[200px] md:max-w-[360px]">
              <div
                aria-hidden="true"
                className="absolute -inset-3 rounded-[24px] bg-gradient-to-br from-secondary/25 via-home-lime/20 to-primary/25 blur-2xl md:-inset-5 md:blur-3xl"
              />
              <div className="relative aspect-[4/5] overflow-hidden rounded-[20px] shadow-[0_20px_50px_-20px_rgb(31_31_31/0.3)]">
                {founderImageUrl ? (
                  <Image
                    src={founderImageUrl}
                    alt="Kelvin, founder of Snack Quest."
                    fill
                    sizes="(min-width: 768px) 360px, 200px"
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
              <div
                aria-hidden="true"
                className="absolute top-[-10px] left-[-10px] hidden -rotate-[10deg] items-center rounded-md border border-secondary/70 bg-background/95 px-2 py-1 text-[10px] font-bold tracking-wide text-secondary uppercase shadow-sm md:flex md:top-[-16px] md:left-[-16px] md:px-3 md:py-1.5 md:text-xs"
              >
                Nairobi · Founder
              </div>
            </div>
          </Reveal>

          <div>
            <div className="border-secondary/20 flex max-w-[460px] flex-col gap-4 border-l-2 pl-5">
              {STORY_BEATS.map(({ text, beat }, index) => (
                <Reveal key={text} delayMs={200 + index * 70}>
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

            <Reveal delayMs={200 + STORY_BEATS.length * 70 + 40}>
              <p className="border-border mt-7 max-w-[460px] border-t pt-6 text-foreground text-lg font-semibold md:text-xl">
                So I built the Creator Program.
              </p>
            </Reveal>
          </div>
        </div>

        <Reveal delayMs={200 + STORY_BEATS.length * 70 + 140}>
          <div className="mt-12 md:mt-20">
            <p className="text-caption font-bold tracking-[0.3em] text-foreground/60 uppercase">
              Three reasons, honestly
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {REASONS.map((reason) => (
                <div
                  key={reason.title}
                  className="border-border bg-surface flex flex-col gap-2 rounded-2xl border p-5"
                >
                  <reason.icon className="size-5 text-secondary" strokeWidth={2.2} aria-hidden="true" />
                  <h3 className="text-card-title font-display text-xl leading-[1.1] font-normal uppercase">
                    {reason.title}
                  </h3>
                  <p className="text-small text-foreground/70">{reason.body}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
