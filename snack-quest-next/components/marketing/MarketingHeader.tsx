'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { WhatsAppOrderButton } from './WhatsAppOrderButton';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/boxes', label: 'Boxes' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/creators', label: 'Creator program' },
  { href: '/faq', label: 'FAQ' },
  { href: '/about', label: 'Our story' },
  { href: '/contact', label: 'Contact' },
];

export function MarketingHeader({
  businessName,
  whatsappCustomerNumber,
}: {
  businessName: string;
  whatsappCustomerNumber: string | null;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
            SQ
          </span>
          <span className="text-base font-bold tracking-tight text-foreground">{businessName}</span>
        </Link>

        <nav className="hidden items-center gap-6 lg:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                pathname === link.href && 'text-foreground',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:block">
          <WhatsAppOrderButton whatsappCustomerNumber={whatsappCustomerNumber} message="Hi! I'd like to order a Snack Quest box." size="sm" />
        </div>

        <button
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-md text-foreground lg:hidden"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileOpen ? <X className="size-6" aria-hidden="true" /> : <Menu className="size-6" aria-hidden="true" />}
        </button>
      </div>

      {mobileOpen ? (
        <nav id="mobile-nav" aria-label="Primary" className="border-t border-border bg-background px-4 py-4 lg:hidden">
          <ul className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'block rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-border/30 hover:text-foreground',
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
              whatsappCustomerNumber={whatsappCustomerNumber}
              message="Hi! I'd like to order a Snack Quest box."
              className="w-full"
            />
          </div>
        </nav>
      ) : null}
    </header>
  );
}
