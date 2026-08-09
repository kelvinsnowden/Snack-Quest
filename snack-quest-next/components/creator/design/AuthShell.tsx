import type { ReactNode } from 'react';
import Image from 'next/image';

/**
 * Shared shell for the creator login/register screens (§ Creator
 * Portal premium rebuild, reference-image quality pass). Both screens
 * were a flat bordered card on the page background — the one part of
 * the portal that had gone completely untouched through every prior
 * pass, and the exact kind of screen the reference apps invest the
 * most polish in, since it's the very first thing anyone sees.
 *
 * Soft brand-colour glow behind a frosted card rather than a literal
 * copy of any one reference's palette — purple and orange are already
 * this app's two accents (secondary/primary), so the atmosphere reads
 * as Snack Quest, not as a skin borrowed from someone else's app.
 *
 * Sized for a phone first, since that is where creators actually sign
 * in. `min-h-dvh` rather than `min-h-screen` because `100vh` on mobile
 * Safari and Chrome measures the viewport *without* the browser
 * chrome, so a screen built to fill it is always taller than what you
 * can see. `justify-center` only once there's headroom for it, so a
 * small screen — or one with the keyboard open — starts the card at
 * the top and scrolls naturally instead of centring content that no
 * longer fits.
 */
export function AuthShell({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <main
      className="bg-background relative flex min-h-dvh flex-col justify-start overflow-hidden px-5 pt-10 sm:justify-center sm:px-4 sm:py-12"
      style={{ paddingBottom: 'calc(2.5rem + env(safe-area-inset-bottom))' }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="bg-secondary/20 absolute -top-40 left-1/2 size-[480px] -translate-x-1/2 rounded-full blur-3xl" />
        <div className="bg-primary/15 absolute -right-24 -bottom-32 size-[420px] rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center sm:mb-8">
          <Image
            src="/logo.png"
            alt="Snack Quest"
            width={56}
            height={56}
            className="size-12 rounded-2xl object-cover shadow-lg sm:size-14"
          />
          {/*
            48px (`text-page-title`) is a desktop hero size — on a
            360px phone "Welcome back, Kelvin" broke onto three lines
            and pushed the form itself below the fold. Scales up to the
            full treatment where there's width for it.
          */}
          <h1 className="text-foreground text-2xl font-bold tracking-tight text-balance sm:text-[length:var(--text-page-title)] sm:leading-[1.1]">
            {title}
          </h1>
          <p className="text-muted-foreground text-sm text-pretty">{description}</p>
        </div>

        <div className="border-border/60 bg-surface/90 rounded-2xl border p-5 shadow-[0_30px_80px_-30px_rgb(108_59_255/0.25)] backdrop-blur-xl sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
