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
        className="bg-primary/20 pointer-events-none absolute inset-x-0 top-1/3 mx-auto size-[70%] rounded-full blur-[100px]"
      />
      <div
        aria-hidden="true"
        className="bg-secondary/15 pointer-events-none absolute inset-x-0 -bottom-10 mx-auto size-[55%] rounded-full blur-[90px]"
      />

      <div className="border-border relative mx-auto flex aspect-[4/5] w-full max-w-[300px] flex-col items-center justify-center gap-4 overflow-hidden rounded-[2rem] border bg-white shadow-[0_30px_80px_-30px_rgba(31,31,31,0.25)] sm:max-w-[340px]">
        <span aria-hidden="true" className="border-primary/40 pointer-events-none absolute top-5 left-5 size-6 rounded-tl-md border-t-2 border-l-2" />
        <span aria-hidden="true" className="border-primary/40 pointer-events-none absolute top-5 right-5 size-6 rounded-tr-md border-t-2 border-r-2" />
        <span aria-hidden="true" className="border-primary/40 pointer-events-none absolute bottom-5 left-5 size-6 rounded-bl-md border-b-2 border-l-2" />
        <span aria-hidden="true" className="border-primary/40 pointer-events-none absolute bottom-5 right-5 size-6 rounded-br-md border-b-2 border-r-2" />

        <ImageIcon className="text-foreground/25 size-9" aria-hidden="true" />
        <div className="text-center">
          <p className="font-display text-foreground text-lg uppercase tracking-wide sm:text-xl">Discovery Machine</p>
          <p className="text-foreground/40 mt-1 text-xs">Product photo — coming soon</p>
        </div>
      </div>
    </div>
  );
}
