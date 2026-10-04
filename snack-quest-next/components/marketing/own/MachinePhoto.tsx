import Image from 'next/image';
import { HERO_MACHINE_PHOTO_SRC } from './ownPhotos';

/**
 * The real Discovery Machine product photo (§ machine-owner
 * lead-generation landing page). Used both large in the hero, next to
 * the headline, and again smaller at the final CTA — same photo, two
 * sizes, so `variant` only changes layout, never the image.
 */
export function MachinePhoto({ className, variant = 'portrait' }: { className?: string; variant?: 'portrait' | 'landscape' }) {
  if (variant === 'landscape') {
    return (
      <div className={`relative ${className ?? ''}`}>
        <div aria-hidden="true" className="pointer-events-none absolute -inset-6 -z-0 rounded-[2.5rem] bg-primary/[0.07] sm:-inset-8" />

        <span className="absolute -top-3 -left-3 z-10 rounded-full border border-border bg-background px-3 py-1 text-[11px] font-bold tracking-[0.1em] text-own-accent-ink uppercase shadow-[var(--sq-shadow-md)]">
          Discovery Machine
        </span>

        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[1.75rem] shadow-[var(--sq-shadow-lg)] sm:aspect-[4/5]">
          <Image
            src={HERO_MACHINE_PHOTO_SRC}
            alt="A Snack Quest Discovery Machine, wrapped in its world-snacks branding, standing in a mall."
            fill
            priority
            sizes="(min-width: 1024px) 620px, 90vw"
            className="object-cover"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <div className="relative mx-auto aspect-[2/3] w-full max-w-[300px] overflow-hidden rounded-[2rem] shadow-[var(--sq-shadow-lg)] sm:max-w-[340px]">
        <Image
          src={HERO_MACHINE_PHOTO_SRC}
          alt="A Snack Quest Discovery Machine, wrapped in its world-snacks branding, standing in a mall."
          fill
          sizes="340px"
          className="object-cover"
        />
      </div>
    </div>
  );
}
