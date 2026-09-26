'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OwnCta } from './OwnCta';

const SECTIONS = [
  { id: 'how-it-works', label: 'How it Works' },
  { id: 'locations', label: 'Locations' },
  { id: 'faq', label: 'FAQ' },
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
        scrolled || open ? 'border-b border-white/10 bg-black/90 backdrop-blur' : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <Link href="/own" className="flex shrink-0 items-center gap-2.5">
          <Image src="/deck/logo.png" alt="" width={36} height={36} className="size-9 rounded-lg" priority />
          <span className="font-display text-[15px] leading-none tracking-tight text-white sm:text-[17px]">Snack Quest</span>
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-1 lg:flex">
          <a href="#" className="text-primary decoration-primary px-3.5 py-2 text-sm font-semibold underline decoration-2 underline-offset-8">
            Own a Machine
          </a>
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-full px-3.5 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
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
            className="inline-flex size-10 items-center justify-center rounded-full border border-white/15 text-white lg:hidden"
          >
            {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {open ? (
        <div id="own-mobile-nav" className="border-t border-white/10 px-5 pb-5 lg:hidden">
          <nav aria-label="Sections" className="flex flex-col py-2">
            <a href="#" onClick={() => setOpen(false)} className="text-primary rounded-xl px-3 py-3 text-base font-semibold">
              Own a Machine
            </a>
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 text-base font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
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
