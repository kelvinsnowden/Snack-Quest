'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Boxes,
  Camera,
  FileText,
  LayoutGrid,
  MapPin,
  MessageCircle,
  Package,
  ReceiptText,
  Settings,
  Tag,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildWhatsAppOrderUrl } from '@/lib/whatsapp/orderLink';

/**
 * `mobileLabel` keeps the bottom tab bar's labels to one word each so
 * none of them wrap to a second line at phone width (the fuller
 * `label` used in `PartnerSideNav`'s much wider desktop rail is fine).
 * The mobile bar deliberately keeps the original five core tabs rather
 * than the side rail's longer list — five is already tight at phone
 * width, and everything else stays one tap away from `/partner`.
 */
const TABS = [
  { href: '/partner', label: 'Overview', mobileLabel: 'Overview', icon: LayoutGrid },
  { href: '/partner/machines', label: 'My Machines', mobileLabel: 'Machines', icon: Boxes },
  { href: '/partner/sales', label: 'Sales & Revenue', mobileLabel: 'Sales', icon: BarChart3 },
  { href: '/partner/payouts', label: 'Payouts', mobileLabel: 'Payouts', icon: Wallet },
  { href: '/partner/subscription', label: 'Subscription', mobileLabel: 'Plan', icon: ReceiptText },
];

/**
 * The desktop side rail's own, longer nav (§ Owner Portal dark
 * redesign) — every section the reference dashboard's sidebar shows.
 * `Inventory`, `Locations`, `Products`, `Cameras` and `Reports` are new
 * routes built as this pass's placeholders: real where the data is
 * already one `ownerPortalService` call away (Inventory, Locations,
 * Products, Cameras all reuse data the Overview page already fetches),
 * a plain "coming soon" only for Reports, which has no backing
 * aggregation yet. `Payouts` and `Subscription` are the two real,
 * already-shipped features the reference mockup didn't happen to show
 * — dropping them would remove working functionality, so they stay,
 * appended after the mockup's own order.
 */
const SIDE_NAV = [
  { href: '/partner', label: 'Overview', icon: LayoutGrid },
  { href: '/partner/machines', label: 'Machines', icon: Boxes },
  { href: '/partner/sales', label: 'Sales', icon: BarChart3 },
  { href: '/partner/inventory', label: 'Inventory', icon: Package },
  { href: '/partner/locations', label: 'Locations', icon: MapPin },
  { href: '/partner/products', label: 'Products', icon: Tag },
  { href: '/partner/cameras', label: 'Cameras', icon: Camera },
  { href: '/partner/reports', label: 'Reports', icon: FileText },
  { href: '/partner/payouts', label: 'Payouts', icon: Wallet },
  { href: '/partner/subscription', label: 'Subscription', icon: ReceiptText },
  { href: '/partner/settings', label: 'Settings', icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/partner' ? pathname === '/partner' : pathname.startsWith(href);
}

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
        const active = isActive(pathname, href);
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

/**
 * The desktop side rail (§ Owner Portal dark redesign) — a permanently
 * dark panel matching the reference mockup: product mark up top, the
 * full nav, and a support card pinned to the bottom rather than
 * scrolling away with a long nav list. `mt-auto` on the support card
 * is what pins it — the nav above takes only the height it needs.
 */
export function PartnerSideNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface p-4 md:flex">
      <Link href="/partner" className="mb-6 flex items-center gap-2.5 px-2">
        <Image src="/logo.png" alt="" aria-hidden="true" width={32} height={32} className="size-8 rounded-lg" />
        <span className="text-base font-bold text-foreground">Snack Quest</span>
      </Link>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {SIDE_NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-border/30 hover:text-foreground',
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </div>

      <a
        href={buildWhatsAppOrderUrl("Hi Snack Quest! I need help with my Owner Portal account.")}
        target="_blank"
        rel="noopener noreferrer"
        className="from-secondary to-primary mt-4 flex flex-col gap-2 rounded-2xl bg-gradient-to-br p-4 text-white"
      >
        <MessageCircle className="size-6" aria-hidden="true" />
        <span className="text-sm font-bold">Need support?</span>
        <span className="text-xs text-white/80">Our team is here to help.</span>
      </a>
    </nav>
  );
}
