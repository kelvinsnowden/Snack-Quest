import Image from 'next/image';
import { OWNER_PORTAL_PHOTO_SRC } from './ownPhotos';

/**
 * The real Owner Portal dashboard screenshot (§ machine-owner
 * lead-generation landing page). The portal itself is real and live
 * (`/partner`); this is a representative mockup rather than one real
 * owner's actual figures, so nothing here leaks a specific owner's
 * business into a page every visitor can load.
 */
export function OwnerPortalPhoto({ className }: { className?: string }) {
  return (
    // The screenshot is a dark UI on black: framed as a screen on the white page rather than left as a black rectangle.
    <div className={`relative aspect-[2/3] w-full overflow-hidden rounded-3xl bg-own-panel p-2 shadow-[var(--sq-shadow-lg)] sm:p-3 ${className ?? ''}`}>
      <Image
        src={OWNER_PORTAL_PHOTO_SRC}
        alt="The Snack Quest Owner Portal dashboard, showing machines, sales, inventory, locations and cameras."
        fill
        sizes="(min-width: 1024px) 480px, 90vw"
        className="object-contain"
      />
    </div>
  );
}
