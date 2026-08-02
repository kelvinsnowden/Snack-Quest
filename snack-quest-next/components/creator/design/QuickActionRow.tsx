import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

/**
 * The four destinations a creator reaches for, sitting directly under
 * the balance (§ Creator Portal premium rebuild, wallet pattern).
 *
 * Consumer finance apps put this row here because it answers "now
 * what?" the instant the balance answers "how much?". The portal has
 * the same shape of question.
 *
 * Four across at every width on purpose: it fits a 320px screen, and
 * reflowing to two rows on small phones would put two of the four
 * below the fold, which defeats the point of a shortcut row. Labels
 * stay visible rather than becoming icon-only — an unlabelled glyph
 * is a guess, and this row is the portal's primary wayfinding on
 * mobile alongside the tab bar.
 */
export type QuickAction = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export function QuickActionRow({ actions }: { actions: QuickAction[] }) {
  return (
    <nav aria-label="Quick actions">
      <ul className="grid grid-cols-4 gap-2 md:gap-3">
        {actions.map((action) => (
          <li key={action.href}>
            <Link
              href={action.href}
              className="focus-visible:ring-primary focus-visible:ring-offset-background hover:bg-surface flex min-h-[5rem] flex-col items-center justify-center gap-2 rounded-xl px-1 py-3 text-center transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <span
                aria-hidden="true"
                className="border-border bg-surface text-foreground flex size-11 items-center justify-center rounded-full border"
              >
                <action.icon className="size-5" strokeWidth={2} />
              </span>
              <span className="text-foreground text-xs leading-tight font-medium">
                {action.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
