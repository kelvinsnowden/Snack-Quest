'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

function subscribeNever(): () => void {
  return () => {};
}

function isObserverSupported(): boolean {
  return typeof IntersectionObserver !== 'undefined';
}

function isObserverSupportedOnServer(): boolean {
  return false;
}

/**
 * Scroll-triggered fade-up wrapper (§ jungle-adventure landing page
 * rebuild) — the home page's signature motion, used ~25 times. Content
 * is always present in server-rendered markup and visible by default;
 * `useSyncExternalStore` reports `false` for the server render and the
 * client's hydration pass (matching exactly, so no mismatch), then
 * flips to `true` right after hydration completes — this is React's
 * own sanctioned mechanism for "read a capability that differs between
 * server and client" without the cascading-render risk of calling
 * `setState` synchronously inside a plain effect. Once `true`, the
 * hidden starting state applies and a real `IntersectionObserver`
 * takes over — so a no-JS visitor or a browser without observer
 * support never sees hidden content, no `<noscript>` needed.
 */
export function Reveal({
  children,
  delayMs = 0,
  className,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  delayMs?: number;
  className?: string;
  as?: 'div' | 'li';
}) {
  const ref = useRef<HTMLDivElement & HTMLLIElement>(null);
  const hydrated = useSyncExternalStore(
    subscribeNever,
    isObserverSupported,
    isObserverSupportedOnServer,
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hydrated || !ref.current) {
      return;
    }
    const node = ref.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hydrated]);

  return (
    <Tag
      ref={ref}
      className={`${hydrated ? (visible ? 'reveal-visible' : 'reveal-hidden') : ''} ${className ?? ''}`}
      style={hydrated ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
