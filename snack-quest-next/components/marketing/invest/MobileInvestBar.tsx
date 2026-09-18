'use client';

import { useEffect, useState } from 'react';
import { InvestCta } from './InvestCta';

/**
 * The phone-sized CTA (§ investor interest page).
 *
 * Most of this page's traffic arrives from WhatsApp, TikTok and QR
 * codes, which means a thumb on a long page — and the action is at the
 * bottom of it. So the bar follows.
 *
 * Two rules keep it from being intrusive. It stays hidden until the
 * hero is behind you, because the hero already has a CTA and a bar
 * over the video would cover the one thing the page opens with; and it
 * hides again once the form is on screen, because a floating button
 * pointing at the form you are already filling in is just a button
 * covering that form's last field.
 */
export function MobileInvestBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const form = document.getElementById('investor-interest');

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
        'fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#120c22]/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur transition-transform duration-300 sm:hidden ' +
        (visible ? 'translate-y-0' : 'translate-y-full')
      }
      // Hidden from the accessibility tree when it is off screen, so a
      // screen reader is not offered a control nobody can see.
      aria-hidden={!visible}
    >
      <InvestCta source="mobile_bar" className="w-full" size="md">
        Express investor interest
      </InvestCta>
    </div>
  );
}
