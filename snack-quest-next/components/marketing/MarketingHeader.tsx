'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { BuyNowButton } from './BuyNowButton';
import { useActiveBox } from './design/ActiveBoxContext';
import { cn } from '@/lib/utils';

// Deliberately just the customer journey (§ CRO audit — nav). Creator
// program and Contact are real, useful pages, but a visitor who
// arrived from an ad to buy a box shouldn't have to weigh them against
// "Boxes" for attention in the one nav row they'll actually scan —
// both stay one click away in the footer, which every page already
// has.
const NAV_LINKS = [
  // The logo goes home, but that is a convention people have to know
  // rather than see — and on mobile it competes with a hamburger for
  // attention. An explicit entry costs one line and removes the
  // dead-end feeling of being three pages deep.
  { href: '/', label: 'Home' },
  { href: '/boxes', label: 'Boxes' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/reviews', label: 'Reviews' },
  { href: '/faq', label: 'FAQ' },
];

export function MarketingHeader({ businessName }: { businessName: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Set by a box's own detail page — so the header's CTA takes the
  // visitor straight to checkout for the box they're already reading
  // about, rather than making them pick it a second time.
  const activeBox = useActiveBox();

  return (
    <header className="border-border bg-background/95 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2"
          onClick={() => setMobileOpen(false)}
        >
          <Image src="/logo.png" alt="Snack Quest" width={36} height={36} className="size-9 rounded-xl object-cover" />
          <span className="text-foreground text-base font-bold tracking-tight">
            {businessName}
          </span>
        </Link>

        <nav className="hidden items-center gap-6 lg:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'text-muted-foreground hover:text-foreground text-sm font-medium transition-colors',
                pathname === link.href && 'text-foreground',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:block">
          <BuyNowButton packageId={activeBox?.id} size="sm">
            {activeBox ? `Buy the ${activeBox.name}` : 'Buy now'}
          </BuyNowButton>
        </div>

        <button
          type="button"
          className="text-foreground inline-flex size-10 items-center justify-center rounded-md lg:hidden"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileOpen ? (
            <X className="size-6" aria-hidden="true" />
          ) : (
            <Menu className="size-6" aria-hidden="true" />
          )}
        </button>
      </div>

      {mobileOpen ? (
        <nav
          id="mobile-nav"
          aria-label="Primary"
          className="border-border bg-background border-t px-4 py-4 lg:hidden"
        >
          <ul className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'text-muted-foreground hover:bg-border/30 hover:text-foreground block rounded-md px-3 py-2.5 text-sm font-medium',
                    pathname === link.href && 'text-foreground',
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <BuyNowButton
              packageId={activeBox?.id}
              className="w-full"
              onClick={() => setMobileOpen(false)}
            >
              {activeBox ? `Buy the ${activeBox.name}` : 'Buy now'}
            </BuyNowButton>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
