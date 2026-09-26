'use client';

import { useEffect, useState } from 'react';
import { OwnCta } from './OwnCta';

/**
 * The phone-sized CTA (§ machine-owner lead-generation landing page)
 * — mirrors `MobileInvestBar`'s own visibility rule exactly: hidden
 * over the hero (which has its own CTA), hidden again once the
 * application form is on screen.
 */
export function MobileOwnBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const form = document.getElementById('apply');

    let formOnScreen = false;
    const observer =
      form && typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            ([entry]) => {
              formOnScreen = entry.isIntersecting;
              setVisible(window.scrollY > 600 && !formOnScreen);
            },
            { rootMargin: '0px 0px -20% 0px' },
          )
        : null;
    observer?.observe(form!);

    const onScroll = () => setVisible(window.scrollY > 600 && !formOnScreen);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      observer?.disconnect();
    };
  }, []);

  return (
    <div
      className={
        'border-border fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_-15px_rgba(31,31,31,0.15)] backdrop-blur transition-transform duration-300 sm:hidden ' +
        (visible ? 'translate-y-0' : 'translate-y-full')
      }
      aria-hidden={!visible}
    >
      <OwnCta source="mobile_bar" className="w-full" size="md">
        Apply to become a machine owner
      </OwnCta>
    </div>
  );
}
