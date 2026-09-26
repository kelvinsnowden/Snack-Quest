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
        <div
          aria-hidden="true"
          className="bg-primary/20 pointer-events-none absolute -top-10 -left-10 size-[55%] rounded-full blur-[100px]"
        />
        <div
          aria-hidden="true"
          className="bg-secondary/15 pointer-events-none absolute -right-10 -bottom-10 size-[50%] rounded-full blur-[90px]"
        />

        <span className="border-primary/40 bg-black/70 text-primary absolute -top-3 -left-3 z-10 rounded-full border px-3 py-1 text-[11px] font-bold tracking-[0.1em] uppercase backdrop-blur-sm">
          Discovery Machine
        </span>

        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[1.75rem] shadow-[0_40px_100px_-30px_rgba(0,0,0,0.7)] sm:aspect-[4/5]">
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
      <div
        aria-hidden="true"
        className="bg-primary/25 pointer-events-none absolute inset-x-0 top-1/3 mx-auto size-[70%] rounded-full blur-[100px]"
      />
      <div
        aria-hidden="true"
        className="bg-secondary/20 pointer-events-none absolute inset-x-0 -bottom-10 mx-auto size-[55%] rounded-full blur-[90px]"
      />

      <div className="relative mx-auto aspect-[2/3] w-full max-w-[300px] overflow-hidden rounded-[2rem] shadow-[0_40px_100px_-30px_rgba(0,0,0,0.7)] sm:max-w-[340px]">
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
