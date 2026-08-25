'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { visibleNavItems, groupedNavItems, isNavItemActive } from './adminNav';
import { useI18n } from './i18n/LocaleProvider';
import type { AdminSection } from '@/lib/auth/adminSections';

export function AdminSidebar({
  businessName,
  visibleSections,
}: {
  businessName: string;
  /** `null` means unrestricted (§ Staff access control) — every section shows. */
  visibleSections: AdminSection[] | null;
}) {
  const pathname = usePathname();
  const { dict } = useI18n();
  // Grouped here too, not just in the phone drawer: the two menus are
  // built from one list, and letting them disagree about how the
  // product is organised would make the rail and the drawer feel like
  // different applications (§ Admin mobile UX overhaul).
  const groups = groupedNavItems(visibleNavItems(visibleSections));

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
        <Image src="/logo.png" alt="Snack Quest" width={32} height={32} className="size-8 shrink-0 rounded-lg object-cover" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{businessName}</p>
          <p className="text-caption text-muted-foreground">{dict.nav.admin}</p>
        </div>
      </div>

      <nav aria-label={dict.nav.navigation} className="flex-1 overflow-y-auto p-3">
        {groups.map(({ group, items }) => (
          <div key={group} data-nav-group={group} className="mb-4 last:mb-0">
            <p className="text-caption text-muted-foreground px-3 pb-1.5 font-semibold tracking-wide uppercase">
              {/*
                Falls back to the English group name when the
                dictionary has no key for it — a group added later
                shows in English rather than blank.
              */}
              {dict.nav.groups[group as keyof typeof dict.nav.groups] ?? group}
            </p>
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                const isActive = isNavItemActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-border/40 hover:text-foreground',
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      {dict.nav.items[item.href as keyof typeof dict.nav.items] ?? item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
