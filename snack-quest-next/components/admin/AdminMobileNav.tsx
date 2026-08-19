'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { visibleNavItems, groupedNavItems, isNavItemActive } from './adminNav';
import type { AdminSection } from '@/lib/auth/adminSections';

/**
 * The phone's full navigation (§ Admin mobile UX overhaul).
 *
 * Three things were wrong with the drawer this replaces, all of them
 * only visible on a phone:
 *
 *  - It rendered `ADMIN_NAV_ITEMS` directly, so a staff member with
 *    restricted access saw every section on mobile while the desktop
 *    sidebar correctly hid them. The pages themselves were always
 *    guarded server-side (`requireAdminSection`), so this was a
 *    misleading menu rather than a way in — but it advertised doors
 *    that only open onto a redirect.
 *  - Twenty-six equally-weighted links in one flat column, with the
 *    last third below the fold. Finding "Withdrawals" meant reading
 *    past eighteen unrelated labels.
 *  - Rows were tall enough to read and too short to hit reliably.
 *
 * So: filtered by the same `visibleSections` the sidebar uses, grouped
 * under headings, and searchable — with 26 destinations, typing three
 * letters beats scanning every time. The filter matches label text
 * only; it is a way to reach a page you already know exists, not a
 * content search (that is `GlobalSearchTrigger`, which sits in the top
 * bar next to this).
 */
export function AdminMobileNav({
  businessName,
  visibleSections,
}: {
  businessName: string;
  /** `null` means unrestricted (§ Staff access control) — every section shows. */
  visibleSections: AdminSection[] | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const pathname = usePathname();

  const items = useMemo(() => visibleNavItems(visibleSections), [visibleSections]);

  // The bottom bar's "More" opens this same drawer rather than owning a
  // second one — see `AdminBottomBar` for why it asks by event instead
  // of by prop.
  useEffect(() => {
    function openFromBottomBar() {
      setOpen(true);
    }
    window.addEventListener('admin:open-nav', openFromBottomBar);
    return () => window.removeEventListener('admin:open-nav', openFromBottomBar);
  }, []);

  const trimmed = query.trim().toLowerCase();
  const matches = useMemo(
    () => (trimmed ? items.filter((item) => item.label.toLowerCase().includes(trimmed)) : []),
    [items, trimmed],
  );
  const groups = useMemo(() => groupedNavItems(items), [items]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open navigation menu"
        onClick={() => setOpen(true)}
      >
        <Menu aria-hidden="true" />
      </Button>

      <SheetContent side="left" className="w-[19rem] gap-0">
        <SheetHeader>
          <SheetTitle>{businessName}</SheetTitle>
          <SheetDescription>Admin navigation</SheetDescription>
        </SheetHeader>

        <div className="px-5 pt-3 pb-1">
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Jump to a page…"
              aria-label="Filter navigation"
              className="pl-9"
            />
          </div>
        </div>

        <nav
          aria-label="Admin navigation"
          className="flex-1 overflow-y-auto px-3 pt-2"
          style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
        >
          {trimmed ? (
            matches.length > 0 ? (
              <ul className="flex flex-col gap-0.5">
                {matches.map((item) => (
                  <li key={item.href}>
                    <NavLink item={item} pathname={pathname} onNavigate={close} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                No page matches “{query.trim()}”.
              </p>
            )
          ) : (
            groups.map(({ group, items: groupItems }) => (
              <div key={group} data-nav-group={group} className="mb-4 last:mb-0">
                <p className="text-caption text-muted-foreground px-3 pb-1.5 font-semibold tracking-wide uppercase">
                  {group}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {groupItems.map((item) => (
                    <li key={item.href}>
                      <NavLink item={item} pathname={pathname} onNavigate={close} />
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: ReturnType<typeof visibleNavItems>[number];
  pathname: string;
  onNavigate: () => void;
}) {
  const isActive = isNavItemActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      // `min-h-11` is 44px — the smallest target a thumb hits reliably,
      // and what these rows were short of before.
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-border/40 hover:text-foreground',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {item.label}
    </Link>
  );
}
