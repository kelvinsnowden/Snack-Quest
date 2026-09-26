import { LayoutDashboard } from 'lucide-react';

/**
 * A placeholder slot for a real Owner Portal screenshot
 * (§ machine-owner lead-generation landing page). The Owner Portal is
 * real and live (`/partner`), but this page is public — showing an
 * actual owner's figures here would leak one owner's business into a
 * page every visitor can load, and a fabricated one would misrepresent
 * the product. It says exactly what it is rather than pretending to be
 * a real screenshot.
 */
export function DashboardImagePlaceholder({ className }: { className?: string }) {
  return (
    <div className={`relative rounded-2xl bg-gradient-to-br from-secondary/60 via-primary/40 to-secondary/60 p-[1.5px] ${className ?? ''}`}>
      <div className="relative flex aspect-[4/5] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl bg-[#0c0c0c] p-8 text-center sm:aspect-square">
        <LayoutDashboard className="size-9 text-white/25" aria-hidden="true" />
        <p className="font-display text-lg text-white uppercase tracking-wide">Owner Portal Dashboard</p>
        <p className="text-xs text-white/40">Screenshot will go here</p>
      </div>
    </div>
  );
}
