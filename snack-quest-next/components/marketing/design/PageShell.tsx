/**
 * The marketing site's page frame (§ Website consistency) — the
 * ambient blur-orb background and container rhythm the home page
 * established, lifted out so every other public page inherits the
 * same one instead of each inventing its own `max-w-*` and padding.
 *
 * The orbs are the home page's, at the lower opacity inner pages want:
 * the hero uses /20 because it is the first thing a visitor sees, but
 * at that strength behind a wall of body copy they fight the text.
 */

const WIDTH_CLASS = {
  narrow: 'max-w-3xl',
  default: 'max-w-4xl',
  wide: 'max-w-6xl',
} as const;

export function PageShell({
  children,
  width = 'default',
}: {
  children: React.ReactNode;
  width?: keyof typeof WIDTH_CLASS;
}) {
  return (
    <div className="bg-background relative min-h-screen overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="bg-primary/15 absolute -top-32 -left-32 size-[500px] rounded-full blur-3xl" />
        <div className="bg-secondary/15 absolute top-40 -right-32 size-[420px] rounded-full blur-3xl" />
      </div>
      <div
        className={`relative mx-auto ${WIDTH_CLASS[width]} px-5 py-20 md:px-10 md:py-28`}
      >
        {children}
      </div>
    </div>
  );
}
