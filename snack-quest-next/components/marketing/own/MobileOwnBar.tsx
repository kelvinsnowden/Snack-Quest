'use client';

import { useEffect, useState } from 'react';
import { OwnCta } from './OwnCta';

/**
 * The phone-sized CTA (§ machine-owner lead-generation landing page).
 *
 * Hidden whenever any in-page CTA is already on screen — not just the
 * application form — so it never stacks a second, identical button
 * directly underneath one the visitor can already see (the page has
 * several CTAs now: hero, qualification, apply, final). Every `OwnCta`
 * instance carries `data-own-cta`, so this only has to watch that
 * selector rather than name each section by id.
 */
export function MobileOwnBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const ctas = Array.from(document.querySelectorAll<HTMLElement>('[data-own-cta]'));
    const onScreen = new Set<Element>();

    const update = () => setVisible(window.scrollY > 400 && onScreen.size === 0);

    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                if (entry.isIntersecting) onScreen.add(entry.target);
                else onScreen.delete(entry.target);
              }
              update();
            },
            { rootMargin: '0px 0px -10% 0px' },
          )
        : null;
    ctas.forEach((cta) => observer?.observe(cta));

    window.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, []);

  return (
    <div
      className={
        'fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur transition-transform duration-300 sm:hidden ' +
        (visible ? 'translate-y-0' : 'translate-y-full')
      }
      aria-hidden={!visible}
    >
      <OwnCta source="mobile_bar" className="w-full" size="md">
        Apply to own a machine
      </OwnCta>
    </div>
  );
}
