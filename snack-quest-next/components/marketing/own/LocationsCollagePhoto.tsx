import Image from 'next/image';
import type { LucideIcon } from 'lucide-react';
import { LOCATION_TYPES } from '@/types/machineOwnerInterest';
import { LOCATIONS_COLLAGE_PHOTO_SRC } from './ownPhotos';

/**
 * The real photo showing every place a Discovery Machine can go —
 * malls, offices, hotels and the rest — together in one collage
 * (§ machine-owner lead-generation landing page). The label row below
 * stays as an accessible, indexable caption for what the image shows,
 * colour-coded per type the same way the rest of the page is.
 */
export function LocationsCollagePhoto({ meta }: { meta: Record<string, { icon: LucideIcon; accent: string }> }) {
  const types = LOCATION_TYPES.filter((option) => option.value !== 'other');

  return (
    <div>
      <div className="relative mx-auto aspect-[2/3] w-full max-w-sm overflow-hidden rounded-2xl lg:mx-0 lg:max-w-none">
        <Image
          src={LOCATIONS_COLLAGE_PHOTO_SRC}
          alt="Snack Quest Discovery Machines placed in a mall, an office, a hotel, a university, a hospital, an apartment lobby, a private school and a transport hub."
          fill
          sizes="(min-width: 1024px) 480px, 90vw"
          className="object-contain"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {types.map((option) => {
          const { icon: Icon, accent } = meta[option.value];
          return (
            <span key={option.value} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/70">
              <Icon className={`size-3.5 shrink-0 ${accent}`} aria-hidden="true" />
              {option.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
