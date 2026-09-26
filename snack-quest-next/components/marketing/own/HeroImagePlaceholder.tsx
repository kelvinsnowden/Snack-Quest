import { Image as ImageIcon } from 'lucide-react';

/**
 * A placeholder slot for the real Discovery Machine product photo
 * (§ machine-owner lead-generation landing page, refinement pass).
 * Deliberately not a photo, a stock image, or another illustrated
 * mockup of the machine — the layout, aspect ratio and framing are
 * already correct so a real photo can be dropped in later as the
 * `src` of an `<Image>` here without touching this section's layout.
 */
export function HeroImagePlaceholder({ className }: { className?: string }) {
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

      <div className="relative mx-auto flex aspect-[4/5] w-full max-w-[300px] flex-col items-center justify-center gap-4 overflow-hidden rounded-[2rem] border border-white/15 bg-gradient-to-b from-[#1c1c1c] to-[#0a0a0a] shadow-[0_40px_100px_-30px_rgba(0,0,0,0.7)] sm:max-w-[340px]">
        <span aria-hidden="true" className="border-primary/40 pointer-events-none absolute top-5 left-5 size-6 rounded-tl-md border-t-2 border-l-2" />
        <span aria-hidden="true" className="border-primary/40 pointer-events-none absolute top-5 right-5 size-6 rounded-tr-md border-t-2 border-r-2" />
        <span aria-hidden="true" className="border-primary/40 pointer-events-none absolute bottom-5 left-5 size-6 rounded-bl-md border-b-2 border-l-2" />
        <span aria-hidden="true" className="border-primary/40 pointer-events-none absolute bottom-5 right-5 size-6 rounded-br-md border-b-2 border-r-2" />

        <ImageIcon className="size-9 text-white/25" aria-hidden="true" />
        <div className="text-center">
          <p className="font-display text-lg text-white uppercase tracking-wide sm:text-xl">Discovery Machine</p>
          <p className="mt-1 text-xs text-white/40">Product photo — coming soon</p>
        </div>
      </div>
    </div>
  );
}
