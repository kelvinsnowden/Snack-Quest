'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OwnCta } from './OwnCta';

const SECTIONS = [
  { id: 'location', label: 'The Location' },
  { id: 'stack', label: 'The Offer' },
  { id: 'portal', label: 'Owner Portal' },
  { id: 'repeat', label: 'Expansion' },
  { id: 'apply', label: 'Qualify' },
] as const;

/**
 * This page's own navigation (§ machine-owner lead-generation landing
 * page) — its own route group and chrome, same rationale as
 * `InvestNav`: someone deciding whether they have what this model
 * needs should not see a "Buy now" shop button.
 */
export function OwnNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('hashchange', close);
    return () => window.removeEventListener('hashchange', close);
  }, [open]);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
        scrolled || open ? 'border-border border-b bg-white/90 backdrop-blur' : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <Link href="/own" className="flex shrink-0 items-center gap-2.5">
          <Image src="/deck/logo.png" alt="" width={36} height={36} className="size-9 rounded-lg" priority />
          <span className="font-display text-foreground text-[15px] leading-none tracking-tight sm:text-[17px]">Snack Quest</span>
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-1 lg:flex">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="text-foreground/70 hover:text-foreground rounded-full px-3.5 py-2 text-sm font-medium transition-colors hover:bg-background"
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <OwnCta source="nav" className="hidden sm:inline-flex" size="sm">
            Apply
          </OwnCta>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="own-mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="border-border text-foreground inline-flex size-10 items-center justify-center rounded-full border lg:hidden"
          >
            {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {open ? (
        <div id="own-mobile-nav" className="border-border border-t bg-white px-5 pb-5 lg:hidden">
          <nav aria-label="Sections" className="flex flex-col py-2">
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                onClick={() => setOpen(false)}
                className="text-foreground/70 hover:text-foreground rounded-xl px-3 py-3 text-base font-medium transition-colors hover:bg-background"
              >
                {section.label}
              </a>
            ))}
          </nav>
          <OwnCta source="nav" className="w-full sm:hidden" onNavigate={() => setOpen(false)}>
            Apply to become a machine owner
          </OwnCta>
        </div>
      ) : null}
    </header>
  );
}
