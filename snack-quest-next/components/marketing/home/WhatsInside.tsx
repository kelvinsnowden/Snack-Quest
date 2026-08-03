import Image from 'next/image';
import { Reveal } from '../design/Reveal';

const CATEGORY_PILLS: Array<{ emoji: string; label: string; position: string; float: 'animate-float-slow' | 'animate-float-slower' }> = [
  { emoji: '🍫', label: 'Chocolate', position: 'top-4 left-4 md:top-10 md:left-8', float: 'animate-float-slow' },
  { emoji: '🍪', label: 'Crunchy', position: 'top-8 right-4 md:top-16 md:right-10', float: 'animate-float-slower' },
  { emoji: '🍬', label: 'Sweet', position: 'top-1/2 -left-2 -translate-y-1/2 md:left-0', float: 'animate-float-slow' },
  { emoji: '🌶️', label: 'Spicy', position: 'top-1/2 -right-2 -translate-y-1/2 md:right-0', float: 'animate-float-slower' },
  { emoji: '🥤', label: 'Drinks', position: 'bottom-8 left-6 md:bottom-16 md:left-16', float: 'animate-float-slower' },
  { emoji: '✨', label: 'Surprises', position: 'bottom-6 right-6 md:bottom-14 md:right-16', float: 'animate-float-slow' },
];

/**
 * The visual payoff (§ spec §7.2) — `photoUrl` null renders a
 * jungle-toned illustrated frame instead of a fabricated product
 * photo; swaps to the real flat-lay the instant a URL is provided.
 */
export function WhatsInside({ photoUrl }: { photoUrl: string | null }) {
  return (
    <section className="overflow-hidden bg-background px-5 py-14 md:px-10 md:py-32">
      <Reveal>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-caption font-bold tracking-[0.3em] text-secondary uppercase">The loot</p>
          <h2 className="mt-4 text-balance font-display text-5xl leading-[1] font-normal uppercase md:text-7xl">
            What&apos;s <span className="text-secondary">inside?</span>
          </h2>
          <p className="mt-5 text-base text-foreground/70 md:text-lg">
            Snacks imported directly from{' '}
            <span className="font-semibold text-foreground">Japan, Korea, China &amp; Thailand</span>. Every box is
            hand-curated so no two adventures are ever the same.
          </p>
        </div>
      </Reveal>

      <Reveal delayMs={150}>
        <div className="relative mx-auto mt-10 w-full max-w-[1000px] md:mt-16">
          <div
            aria-hidden="true"
            className="absolute -inset-8 rounded-[48px] bg-gradient-to-br from-primary/20 via-home-lime/20 to-secondary/20 blur-3xl"
          />
          <div className="animate-float-slow relative aspect-[3/2] w-full overflow-hidden rounded-[40px] shadow-[0_30px_80px_-30px_rgb(31_31_31/0.3)]">
            {photoUrl ? (
              <Image
                src={photoUrl}
                alt="An opened Snack Quest box surrounded by imported Asian snacks."
                fill
                sizes="(min-width: 1024px) 1000px, 100vw"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-foreground via-foreground to-secondary text-center">
                <p className="max-w-xs px-6 text-caption font-semibold tracking-wide text-white/60 uppercase">
                  Snack flat-lay photo coming soon
                </p>
              </div>
            )}
          </div>

          {CATEGORY_PILLS.map((pill) => (
            <div
              key={pill.label}
              className={`absolute z-20 ${pill.position} ${pill.float} flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-small font-semibold text-foreground shadow-sm`}
            >
              <span className="text-lg" aria-hidden="true">
                {pill.emoji}
              </span>
              {pill.label}
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
