'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Boxes, LayoutDashboard, ReceiptText, TrendingUp, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * `mobileLabel` keeps the bottom tab bar's five labels to one word
 * each so none of them wrap to a second line at phone width (the
 * two-word `label` — "My Machines", "Sales & Revenue" — is fine in
 * `PartnerSideNav`'s much wider desktop rail, where it stays).
 */
const TABS = [
  { href: '/partner', label: 'Dashboard', mobileLabel: 'Dashboard', icon: LayoutDashboard },
  { href: '/partner/machines', label: 'My Machines', mobileLabel: 'Machines', icon: Boxes },
  { href: '/partner/sales', label: 'Sales & Revenue', mobileLabel: 'Sales', icon: TrendingUp },
  { href: '/partner/payouts', label: 'Payouts', mobileLabel: 'Payouts', icon: Wallet },
  { href: '/partner/subscription', label: 'Subscription', mobileLabel: 'Subscription', icon: ReceiptText },
];

/**
 * The Owner Portal's own bottom tab bar (§ PART 2 — OWNER PORTAL:
 * "must be mobile-first") — fixed over a normally-scrolling document,
 * the same pattern `components/creator/design/PortalNav.tsx` already
 * proved for exactly this problem: a phone's own chrome-collapsing
 * scroll behaviour fights an internally-scrolling shell.
 */
export function PartnerTabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {TABS.map(({ href, mobileLabel, icon: Icon }) => {
        const active = href === '/partner' ? pathname === '/partner' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 whitespace-nowrap py-2.5 text-xs font-medium',
              active ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
            {mobileLabel}
          </Link>
        );
      })}
    </nav>
  );
}

export function PartnerSideNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden w-56 shrink-0 flex-col gap-1 border-r border-border p-4 md:flex">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = href === '/partner' ? pathname === '/partner' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium',
              active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/30 hover:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
