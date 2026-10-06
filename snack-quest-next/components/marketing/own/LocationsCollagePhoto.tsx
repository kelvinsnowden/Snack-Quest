import Image from 'next/image';
import { LOCATIONS_COLLAGE_PHOTO_SRC } from './ownPhotos';

/**
 * The real photo showing every place a Discovery Machine can go —
 * malls, offices, hotels and the rest — together in one collage
 * (§ machine-owner lead-generation landing page). No caption row below
 * it: the photo's own labelled locations already say what this shows,
 * and repeating them as a pill list underneath was pure duplication.
 */
export function LocationsCollagePhoto() {
  return (
    // Shot on black: framed as a dark panel on the white page.
    <div className="relative mx-auto aspect-[2/3] w-full max-w-sm overflow-hidden rounded-3xl bg-own-panel shadow-[var(--sq-shadow-lg)] lg:mx-0 lg:max-w-none">
      <Image
        src={LOCATIONS_COLLAGE_PHOTO_SRC}
        alt="Snack Quest Discovery Machines placed in a mall, an office, a hotel, a university, a hospital, an apartment lobby, a private school and a transport hub."
        fill
        sizes="(min-width: 1024px) 480px, 90vw"
        className="object-contain"
      />
    </div>
  );
}
