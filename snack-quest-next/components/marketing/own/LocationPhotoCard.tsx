import type { LucideIcon } from 'lucide-react';

/**
 * A photo-card placeholder for one location type (§ machine-owner
 * lead-generation landing page, photographic refinement pass).
 *
 * Real photography for malls, offices, hotels etc. doesn't exist in
 * this codebase, and stock photography would misrepresent the actual
 * places Snack Quest operates in — so each card is honestly a
 * placeholder (a faint watermark icon filling the frame) with the real
 * caption bar already in place, ready for a real photo to drop in
 * behind it later without touching the layout.
 *
 * `accentClassName` gives each card its own icon colour (the reference
 * design cycles several brand accents across the grid rather than
 * repeating one colour eight times) — pass a `text-*`/`bg-*` pair.
 */
export function LocationPhotoCard({
  icon: Icon,
  label,
  accentClassName = 'text-primary',
}: {
  icon: LucideIcon;
  label: string;
  accentClassName?: string;
}) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02]">
      <div className="absolute inset-0 flex items-center justify-center">
        <Icon className="size-9 text-white/10" aria-hidden="true" />
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-black/70 px-2.5 py-2 backdrop-blur-sm">
        <Icon className={`size-3.5 shrink-0 ${accentClassName}`} aria-hidden="true" />
        <span className="truncate text-xs font-semibold text-white">{label}</span>
      </div>
    </div>
  );
}
