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
    <main className="bg-background relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="bg-secondary/20 absolute -top-40 left-1/2 size-[480px] -translate-x-1/2 rounded-full blur-3xl" />
        <div className="bg-primary/15 absolute -right-24 -bottom-32 size-[420px] rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <Image
            src="/logo.png"
            alt="Snack Quest"
            width={56}
            height={56}
            className="size-14 rounded-2xl object-cover shadow-lg"
          />
          <h1 className="text-page-title text-foreground font-bold tracking-tight">
            {title}
          </h1>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>

        <div className="border-border/60 bg-surface/90 rounded-2xl border p-6 shadow-[0_30px_80px_-30px_rgb(108_59_255/0.25)] backdrop-blur-xl sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
