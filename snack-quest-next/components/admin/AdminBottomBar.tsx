'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { visibleNavItems, quickAccessNavItems, isNavItemActive } from './adminNav';
import type { AdminSection } from '@/lib/auth/adminSections';

/**
 * The phone's persistent shortcut row (§ Admin mobile UX overhaul).
 *
 * Before this, every single move between pages cost the same three
 * actions: open the drawer, scroll, tap. That is fine for the settings
 * you touch monthly and wrong for the four screens an operator lives
 * in — checking orders, answering a conversation, chasing a delivery.
 * Those are one tap now; everything else is unchanged behind "More",
 * which opens the same drawer.
 *
 * Phone only. On a tablet or desktop the sidebar is already permanently
 * visible, so a second navigation surface would be duplication rather
 * than convenience.
 *
 * "More" is a plain label rather than a second drawer trigger: the
 * drawer's open state lives in `AdminMobileNav` at the top of the
 * screen, and threading it down here would mean lifting that state into
 * the layout for one button. Instead this dispatches the same event the
 * top bar's menu button fires, so there is still exactly one drawer.
 */
export function AdminBottomBar({
  visibleSections,
}: {
  /** `null` means unrestricted (§ Staff access control). */
  visibleSections: AdminSection[] | null;
}) {
  const pathname = usePathname();
  const quickItems = quickAccessNavItems(visibleNavItems(visibleSections));

  // A staff member restricted out of every quick-access page gets no
  // bar at all rather than a row containing only "More", which would
  // be a button that opens the menu sitting under the button that
  // opens the menu.
  if (quickItems.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Quick navigation"
      className="border-border bg-surface/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex items-stretch">
        {quickItems.map((item) => {
          const isActive = isNavItemActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.6875rem] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                <span className="max-w-full truncate">{item.shortLabel ?? item.label}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('admin:open-nav'))}
            className="text-muted-foreground flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[0.6875rem] font-medium"
          >
            <MoreHorizontal className="size-5 shrink-0" aria-hidden="true" />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
