import { LayoutDashboard } from 'lucide-react';

/**
 * A placeholder slot for a real Owner Portal screenshot
 * (§ machine-owner lead-generation landing page, refinement pass).
 * The Owner Portal is real and live (`/partner`), but this page is
 * public — showing an actual owner's figures here would leak one
 * owner's business into a page every visitor can load, and a fabricated
 * one would misrepresent the product. The window chrome is real UI
 * framing (not data); the content area is an obvious, honest slot for
 * the real screenshot to replace later.
 */
export function DashboardImagePlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={`mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-[0_40px_100px_-30px_rgba(0,0,0,0.6)] sm:rounded-3xl ${className ?? ''}`}
    >
      <div className="flex items-center gap-2 border-b border-white/10 bg-black/30 px-4 py-3 sm:px-5">
        <span className="size-2.5 rounded-full bg-white/20" />
        <span className="size-2.5 rounded-full bg-white/20" />
        <span className="size-2.5 rounded-full bg-white/20" />
        <span className="ml-3 text-xs font-medium text-white/40">Owner Portal · Dashboard</span>
      </div>

      <div className="relative flex aspect-[16/10] w-full flex-col items-center justify-center gap-3 p-6">
        <span aria-hidden="true" className="border-primary/40 pointer-events-none absolute top-4 left-4 size-5 rounded-tl-md border-t-2 border-l-2" />
        <span aria-hidden="true" className="border-primary/40 pointer-events-none absolute top-4 right-4 size-5 rounded-tr-md border-t-2 border-r-2" />
        <span aria-hidden="true" className="border-primary/40 pointer-events-none absolute bottom-4 left-4 size-5 rounded-bl-md border-b-2 border-l-2" />
        <span aria-hidden="true" className="border-primary/40 pointer-events-none absolute bottom-4 right-4 size-5 rounded-br-md border-b-2 border-r-2" />

        <LayoutDashboard className="size-9 text-white/25" aria-hidden="true" />
        <p className="font-display text-lg text-white uppercase tracking-wide sm:text-xl">Owner Portal / Dashboard</p>
        <p className="text-xs text-white/40">Live product screenshot — coming soon</p>
      </div>
    </div>
  );
}
