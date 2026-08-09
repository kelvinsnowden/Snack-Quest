'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Lets a box's own detail page (a Server Component nested deep inside
 * `(marketing)/layout.tsx`) tell the persistent header which box the
 * visitor is currently looking at (§ don't make a visitor who already
 * picked a box repeat that choice). App Router data only flows down
 * from layout to page, never back up — this Provider lives once at the
 * layout level, and any descendant page can announce its box without
 * the header needing route params it was never given.
 *
 * Carries the box's id as well as its name now that the header's CTA
 * links into the website checkout (§ Website Becomes the Primary
 * Commerce Channel): `/checkout?box=<id>` needs the identifier, and a
 * name is not one.
 */
interface ActiveBox {
  id: string;
  name: string;
}

const ActiveBoxContext = createContext<{
  activeBox: ActiveBox | null;
  setActiveBox: (box: ActiveBox | null) => void;
} | null>(null);

export function ActiveBoxNameProvider({ children }: { children: ReactNode }) {
  const [activeBox, setActiveBox] = useState<ActiveBox | null>(null);
  return <ActiveBoxContext.Provider value={{ activeBox, setActiveBox }}>{children}</ActiveBoxContext.Provider>;
}

export function useActiveBox(): ActiveBox | null {
  const context = useContext(ActiveBoxContext);
  return context?.activeBox ?? null;
}

export function useActiveBoxName(): string | null {
  return useActiveBox()?.name ?? null;
}

/** Rendered only by a box's detail page — announces that box for as long as the page stays mounted, then clears it. */
export function SetActiveBoxName({ packageId, name }: { packageId: string; name: string }) {
  const context = useContext(ActiveBoxContext);
  const setActiveBox = context?.setActiveBox;
  useEffect(() => {
    setActiveBox?.({ id: packageId, name });
    return () => setActiveBox?.(null);
  }, [packageId, name, setActiveBox]);
  return null;
}
