'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * A collapsed-by-default FAQ list (§ machine-owner lead-generation
 * landing page, mobile digestibility pass). Five fully-expanded
 * answer blocks was the single longest stretch of the page on a
 * phone — collapsing them to one open question at a time turns a
 * screen-and-a-half of scrolling into five one-line rows.
 */
export function FaqAccordion({ items }: { items: readonly { q: string; a: string }[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="mt-10 flex flex-col gap-3 sm:mt-12">
      {items.map((item, index) => {
        const open = openIndex === index;
        return (
          <div key={item.q} className={`rounded-2xl border transition-colors ${open ? 'border-primary/40 bg-surface' : 'border-border bg-background'}`}>
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : index)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-3 rounded-2xl p-5 text-left focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none sm:p-6"
            >
              <span className="text-base font-bold text-foreground sm:text-lg">{item.q}</span>
              <ChevronDown
                className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180 text-own-accent-ink' : ''}`}
                aria-hidden="true"
              />
            </button>
            {open ? (
              <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground sm:px-6 sm:pb-6 sm:text-base">{item.a}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
