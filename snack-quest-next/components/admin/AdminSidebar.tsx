'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { visibleNavItems, isNavItemActive } from './adminNav';
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
  const items = visibleNavItems(visibleSections);

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
        <Image src="/logo.png" alt="Snack Quest" width={32} height={32} className="size-8 shrink-0 rounded-lg object-cover" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{businessName}</p>
          <p className="text-caption text-muted-foreground">Admin</p>
        </div>
      </div>

      <nav aria-label="Admin navigation" className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {items.map((item) => {
          const isActive = isNavItemActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
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
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
