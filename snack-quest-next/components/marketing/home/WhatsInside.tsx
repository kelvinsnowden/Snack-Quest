import Image from 'next/image';
import { Reveal } from '../design/Reveal';
import { SNACK_CATEGORIES } from '@/lib/packages/snackCategories';
import { SnackSlideshow, type SlideshowSnack } from './SnackSlideshow';

/**
 * Where each category floats around the photo. Only the positioning
 * lives here — the categories themselves come from
 * `lib/packages/snackCategories.ts`, so this section and the box pages
 * can't end up describing different products (§ Mission 2 — product
 * pages). Keyed by label so a reordered list can't silently reshuffle
 * the layout.
 */
const PILL_POSITIONS: Record<string, { position: string; float: string }> = {
  Chocolate: { position: 'top-4 left-4 md:top-10 md:left-8', float: 'animate-float-slow' },
  Crunchy: { position: 'top-8 right-4 md:top-16 md:right-10', float: 'animate-float-slower' },
  Sweet: { position: 'top-1/2 -left-2 -translate-y-1/2 md:left-0', float: 'animate-float-slow' },
  Spicy: { position: 'top-1/2 -right-2 -translate-y-1/2 md:right-0', float: 'animate-float-slower' },
  Drinks: { position: 'bottom-8 left-6 md:bottom-16 md:left-16', float: 'animate-float-slower' },
  Surprises: { position: 'bottom-6 right-6 md:bottom-14 md:right-16', float: 'animate-float-slow' },
};

const CATEGORY_PILLS = SNACK_CATEGORIES.map((category) => ({
  ...category,
  ...(PILL_POSITIONS[category.label] ?? { position: 'top-4 left-4', float: 'animate-float-slow' }),
}));

/**
 * The visual payoff (§ spec §7.2) — `photoUrl` null renders a
 * jungle-toned illustrated frame instead of a fabricated product
 * photo; swaps to the real flat-lay the instant a URL is provided.
 */
export function WhatsInside({
  photoUrl,
  snacks = [],
}: {
  photoUrl: string | null;
  /** Real snacks from the catalogue. Empty falls back to the single flat-lay. */
  snacks?: SlideshowSnack[];
}) {
  // The slideshow only earns its place when there is something real to
  // put in it. One snack is a photo, not a slideshow, and none at all
  // leaves the existing flat-lay doing the job it already did.
  const hasSlideshow = snacks.length > 1;
  return (
    <section className="overflow-hidden bg-background px-5 py-14 md:px-10 md:py-32">
      <Reveal>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-caption font-bold tracking-[0.3em] text-secondary uppercase">The loot</p>
          <h2 className="mt-4 text-balance font-display text-5xl leading-[1] font-normal uppercase md:text-7xl">
            What&apos;s <span className="text-secondary">inside?</span>
          </h2>
          {/*
            Left exactly as it was. This section answers "what am I
            actually getting", and that answer is four specific places.
            The international framing lives in the hero; repeating it
            here would only make the concrete part vaguer.
          */}
          <p className="mt-5 text-base text-foreground/70 md:text-lg">
            Snacks sourced from{' '}
            <span className="font-semibold text-foreground">Japan, Korea, China &amp; Thailand</span>, hand-curated
            so no two adventures are ever the same.
          </p>
        </div>
      </Reveal>

      <Reveal delayMs={150}>
        <div className="relative mx-auto mt-10 w-full max-w-[1000px] md:mt-16">
          <div
            aria-hidden="true"
            className="absolute -inset-8 rounded-[48px] bg-gradient-to-br from-primary/20 via-home-lime/20 to-secondary/20 blur-3xl"
          />
          {hasSlideshow ? (
            <div className="relative w-full overflow-hidden rounded-[40px] shadow-[0_30px_80px_-30px_rgb(31_31_31/0.3)]">
              <SnackSlideshow snacks={snacks} />
            </div>
          ) : (
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
          )}

          {/*
            Only over the static flat-lay. On the slideshow they would
            sit across real snack photos and their own captions — the
            categories are a stand-in for showing the snacks, and once
            the snacks are actually shown they are in the way.
          */}
          {hasSlideshow ? null : CATEGORY_PILLS.map((pill) => (
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
