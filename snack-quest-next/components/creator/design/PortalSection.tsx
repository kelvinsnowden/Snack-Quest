import { cn } from '@/lib/utils';

/**
 * A titled region of a portal screen (§ Creator Portal premium
 * rebuild). Exists so section rhythm is set once rather than each
 * screen picking its own `mt-*` and heading size — the inconsistency
 * that reads as "assembled" rather than "designed".
 *
 * The heading is `text-card-title` from the type scale, not an
 * arbitrary size, and `aria-labelledby` is wired from a required `id`
 * so the landmark is announced rather than being a visual-only group.
 */
export function PortalSection({
  id,
  title,
  action,
  children,
  className,
}: {
  id: string;
  title: string;
  /** Usually a link or button aligned opposite the title. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn('flex flex-col', className)}>
      <div className="flex items-center justify-between gap-4">
        <h2 id={id} className="text-card-title text-foreground font-semibold">
          {title}
        </h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
