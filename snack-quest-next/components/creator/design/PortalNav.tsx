'use client';

import { forwardRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Check,
  Home,
  Link2,
  Megaphone,
  Wallet,
  Banknote,
  Trophy,
  UserCog,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { isActiveNavPath } from '@/lib/creator/navigation';

/**
 * Creator Portal navigation (§ Creator Portal premium rebuild).
 *
 * Replaces a `hidden sm:flex` row that left phones with no navigation
 * at all — a creator could reach the dashboard and then had no way to
 * any other screen, on the device the portal is primarily used from.
 *
 * Mobile gets a bottom tab bar, because thumbs reach the bottom of a
 * phone and not the top. Five slots is the ceiling before targets fall
 * below a comfortable width, so the four screens a creator opens daily
 * are promoted and the rest live behind More. Desktop gets a
 * persistent side rail — at that width there is room to show every
 * destination at once and hiding them behind a menu would be
 * artificial.
 *
 * Links are written as `/creator/*` on both hosts: `toInternalPath` is
 * idempotent, so those URLs resolve whether the visitor is on
 * `creators.snackquests.shop` or the apex. Only active-state matching
 * has to normalize, which `isActiveNavPath` handles.
 */

type NavItem = { href: string; label: string; icon: LucideIcon };

/** Opened daily — these earn the bottom bar's four fixed slots. */
const PRIMARY_NAV: NavItem[] = [
  { href: '/creator', label: 'Home', icon: Home },
  { href: '/creator/referrals', label: 'Referrals', icon: Link2 },
  { href: '/creator/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/creator/earnings', label: 'Earnings', icon: Wallet },
];

/** Reached deliberately, not routinely — behind More on mobile. */
const SECONDARY_NAV: NavItem[] = [
  { href: '/creator/withdrawals', label: 'Withdrawals', icon: Banknote },
  { href: '/creator/leaderboard', label: 'Leaderboard', icon: Trophy },
  { href: '/creator/profile', label: 'Profile', icon: UserCog },
];

const ALL_NAV = [...PRIMARY_NAV, ...SECONDARY_NAV];

/**
 * `forwardRef` so `SheetClose asChild` can compose with it — the More
 * panel has to close itself when a destination inside it is chosen,
 * and Radix does that by cloning its child with a ref and handler
 * rather than by an onClick on a wrapping element (which would not be
 * reachable by keyboard).
 */
const RailLink = forwardRef<
  HTMLAnchorElement,
  { item: NavItem; active: boolean }
>(function RailLink({ item, active, ...props }, ref) {
  return (
    <Link
      ref={ref}
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`focus-visible:ring-primary focus-visible:ring-offset-background flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none ${
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
      }`}
      {...props}
    >
      <item.icon className="size-[18px] shrink-0" aria-hidden="true" />
      {item.label}
    </Link>
  );
});

export function PortalSideRail() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Creator portal"
      className="border-border bg-surface hidden w-60 shrink-0 flex-col gap-1 border-r p-4 md:flex"
    >
      {ALL_NAV.map((item) => (
        <RailLink
          key={item.href}
          item={item}
          active={isActiveNavPath(pathname, item.href)}
        />
      ))}
    </nav>
  );
}

/**
 * Raised center action (§ Creator Portal premium rebuild, reference-
 * image quality pass) — the reference apps both put a single elevated
 * circular button in the middle of the tab bar for the one action
 * worth reaching from anywhere. For this portal that's sharing the
 * referral link: it's the one thing a creator does over and over, and
 * every other entry point to it (Referrals page, dashboard) is at
 * least one tap deeper. `shareUrl` is `null` only in the moment before
 * a referral link exists, which registration provisions automatically
 * — the button just disables rather than pretending to work.
 */
function ShareLinkFab({ shareUrl }: { shareUrl: string | null }) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be unavailable (insecure context, permission denied) — the shortcut just does nothing rather than erroring.
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!shareUrl}
      aria-label={copied ? 'Referral link copied' : 'Copy your referral link'}
      className="bg-primary text-primary-foreground focus-visible:ring-primary focus-visible:ring-offset-background absolute -top-5 left-1/2 flex size-14 -translate-x-1/2 items-center justify-center rounded-full shadow-[0_12px_24px_-8px_rgb(255_122_0/0.55)] transition-transform duration-150 ease-out hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50 active:translate-y-0"
    >
      {copied ? (
        <Check className="size-6" aria-hidden="true" />
      ) : (
        <Link2 className="size-6" aria-hidden="true" />
      )}
    </button>
  );
}

export function PortalTabBar({ shareUrl }: { shareUrl: string | null }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const secondaryActive = SECONDARY_NAV.some((item) =>
    isActiveNavPath(pathname, item.href),
  );

  return (
    <nav
      aria-label="Creator portal"
      // pb honours the iOS home-indicator inset so the last row of
      // targets is not sitting under the system gesture bar.
      className="border-border bg-surface/95 fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ShareLinkFab shareUrl={shareUrl} />
      {PRIMARY_NAV.map((item) => {
        const active = isActiveNavPath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`focus-visible:ring-primary flex min-h-[3.25rem] flex-col items-center justify-center gap-1 px-1 py-2 transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset ${
              active ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <item.icon
              className="size-5 shrink-0"
              strokeWidth={active ? 2.4 : 2}
              aria-hidden="true"
            />
            <span className="text-[0.6875rem] leading-none font-medium">
              {item.label}
            </span>
          </Link>
        );
      })}

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            className={`focus-visible:ring-primary flex min-h-[3.25rem] flex-col items-center justify-center gap-1 px-1 py-2 transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset ${
              secondaryActive ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <MoreHorizontal
              className="size-5 shrink-0"
              strokeWidth={secondaryActive ? 2.4 : 2}
              aria-hidden="true"
            />
            <span className="text-[0.6875rem] leading-none font-medium">
              More
            </span>
          </button>
        </SheetTrigger>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className="mt-6 flex flex-col gap-1">
            {SECONDARY_NAV.map((item) => (
              <SheetClose asChild key={item.href}>
                <RailLink
                  item={item}
                  active={isActiveNavPath(pathname, item.href)}
                />
              </SheetClose>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
