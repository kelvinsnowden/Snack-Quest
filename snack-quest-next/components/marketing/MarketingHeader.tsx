'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { WhatsAppOrderButton } from './WhatsAppOrderButton';
import { useActiveBoxName } from './design/ActiveBoxContext';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/boxes', label: 'Boxes' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/creators', label: 'Creator program' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
];

export function MarketingHeader({ businessName }: { businessName: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeBoxName = useActiveBoxName();
  const orderMessage = activeBoxName
    ? `Hi! I'd like to order the ${activeBoxName}.`
    : "Hi! I'd like to order a Snack Quest box.";

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
          <WhatsAppOrderButton
            message={orderMessage}
            size="sm"
          />
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
            <WhatsAppOrderButton
              message={orderMessage}
              className="w-full"
            />
          </div>
        </nav>
      ) : null}
    </header>
  );
}
