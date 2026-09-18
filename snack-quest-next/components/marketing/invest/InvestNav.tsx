'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InvestCta } from './InvestCta';

const SECTIONS = [
  { id: 'opportunity', label: 'The Opportunity' },
  { id: 'store', label: 'The Store' },
  { id: 'traction', label: 'Traction' },
  { id: 'raise', label: 'The Raise' },
  { id: 'faq', label: 'FAQ' },
] as const;

/**
 * The investor page's own navigation (§ investor interest page).
 *
 * Deliberately not the shop header. Someone reading this is deciding
 * whether to have a conversation, and a row of buy buttons would put
 * the wrong action in front of them — so this page sits in its own
 * route group with its own chrome, and the one prominent action is the
 * interest form.
 *
 * Transparent over the hero and solid once you leave it: the hero is a
 * video, and a bar sitting on top of it from the first pixel would
 * crop the thing the page exists to show.
 */
export function InvestNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // A menu that stays open behind a section you just jumped to is a
  // menu covering the thing you asked to see.
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
        scrolled || open
          ? 'bg-[#120c22]/95 border-b border-white/10 backdrop-blur'
          : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <Link href="/invest" className="flex shrink-0 items-center gap-2.5">
          <Image
            src="/deck/logo.png"
            alt=""
            width={36}
            height={36}
            className="size-9 rounded-lg"
            priority
          />
          <span className="font-display text-[15px] leading-none tracking-tight text-white sm:text-[17px]">
            Snack Quest
          </span>
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-1 lg:flex">
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
          <InvestCta source="nav" className="hidden sm:inline-flex" size="sm">
            Investor Interest
          </InvestCta>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="invest-mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="inline-flex size-10 items-center justify-center rounded-full border border-white/15 text-white lg:hidden"
          >
            {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {open ? (
        <div id="invest-mobile-nav" className="border-t border-white/10 px-5 pb-5 lg:hidden">
          <nav aria-label="Sections" className="flex flex-col py-2">
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
          <InvestCta source="nav" className="w-full sm:hidden" onNavigate={() => setOpen(false)}>
            Investor Interest
          </InvestCta>
        </div>
      ) : null}
    </header>
  );
}
