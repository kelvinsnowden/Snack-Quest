import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * One row of an operational list, as a phone sees it (§ Admin mobile
 * UX overhaul).
 *
 * The admin's lists are real tables — eight columns wide in places —
 * inside `overflow-x-auto`. Nothing overflows the page, so nothing
 * looks broken, but on a 390px screen the Orders table is 900px wide:
 * you see who ordered and then side-scroll to find out whether they
 * paid. The status and the amount, the two things anyone opens that
 * page for, are the columns furthest off screen.
 *
 * So below `md` the same rows render as cards and the table is hidden;
 * from `md` up the table returns unchanged. One dataset, two
 * presentations — not a second source of truth, and no data is dropped
 * on mobile, only re-laid-out.
 *
 * Deliberately a Server Component with no interactivity of its own:
 * most callers are already server-rendered pages, and the ones that
 * aren't (`OrdersTable`) pass their own controls in via `leading`.
 */
export interface MobileRecordField {
  label: string;
  value: React.ReactNode;
}

export function MobileRecordCard({
  href,
  title,
  subtitle,
  badge,
  fields,
  leading,
  footer,
  className,
}: {
  /** Makes the whole card tappable. Omit for a record with no detail page. */
  href?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** A status badge, shown top-right where the eye lands after the name. */
  badge?: React.ReactNode;
  /** The columns worth keeping — label/value pairs, two per row. */
  fields?: MobileRecordField[];
  /** A control that owns its own interaction, e.g. a selection checkbox. */
  leading?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const heading = (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-foreground truncate text-sm font-semibold">{title}</div>
        {subtitle ? (
          <div className="text-muted-foreground mt-0.5 truncate text-sm">{subtitle}</div>
        ) : null}
      </div>
      {badge ? <div className="shrink-0">{badge}</div> : null}
      {href ? (
        <ChevronRight className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : null}
    </div>
  );

  return (
    <li className={cn('border-border bg-surface rounded-xl border p-4', className)}>
      <div className="flex items-start gap-3">
        {leading ? <div className="shrink-0 pt-0.5">{leading}</div> : null}
        {href ? (
          // `min-h-11` keeps the tap area at 44px even for a card whose
          // title is a single short line.
          <Link href={href} className="flex min-h-11 min-w-0 flex-1 items-start gap-3">
            {heading}
          </Link>
        ) : (
          heading
        )}
      </div>

      {fields && fields.length > 0 ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          {fields.map((field) => (
            <div key={field.label} className="min-w-0">
              <dt className="text-caption text-muted-foreground tracking-wide uppercase">
                {field.label}
              </dt>
              <dd className="text-foreground mt-0.5 truncate text-sm">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {footer ? <div className="mt-3">{footer}</div> : null}
    </li>
  );
}

/** The list wrapper — cards on a phone, hidden from `md` up where the real table takes over. */
export function MobileRecordList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <ul className={cn('flex flex-col gap-2.5 md:hidden', className)}>{children}</ul>;
}
