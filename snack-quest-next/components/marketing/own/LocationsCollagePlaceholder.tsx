import { Image as ImageIcon } from 'lucide-react';
import { LOCATION_TYPES } from '@/types/machineOwnerInterest';
import type { LucideIcon } from 'lucide-react';

/**
 * A single placeholder for one real photo showing every place a
 * Discovery Machine can go — malls, offices, hotels and the rest —
 * together in one shot (a collage or a wide establishing photo), not
 * eight separate stock images. Replaces what used to be a card grid,
 * one placeholder per location type; the real photo drops in here
 * once it exists, and the label row below stays as the honest caption
 * for what it will show.
 */
export function LocationsCollagePlaceholder({
  meta,
}: {
  meta: Record<string, { icon: LucideIcon; accent: string }>;
}) {
  const types = LOCATION_TYPES.filter((option) => option.value !== 'other');

  return (
    <div>
      <div className="relative flex aspect-[16/10] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-6 text-center">
        <span aria-hidden="true" className="border-primary/40 pointer-events-none absolute top-4 left-4 size-5 rounded-tl-md border-t-2 border-l-2" />
        <span aria-hidden="true" className="border-primary/40 pointer-events-none absolute top-4 right-4 size-5 rounded-tr-md border-t-2 border-r-2" />
        <span aria-hidden="true" className="border-primary/40 pointer-events-none absolute bottom-4 left-4 size-5 rounded-bl-md border-b-2 border-l-2" />
        <span aria-hidden="true" className="border-primary/40 pointer-events-none absolute bottom-4 right-4 size-5 rounded-br-md border-b-2 border-r-2" />

        <ImageIcon className="size-9 text-white/15" aria-hidden="true" />
        <div>
          <p className="font-display text-lg text-white uppercase tracking-wide sm:text-xl">Places Our Machines Can Go</p>
          <p className="mt-1 text-xs text-white/40">Location photo — coming soon</p>
        </div>
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
