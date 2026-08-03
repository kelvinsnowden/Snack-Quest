'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Lets a box's own detail page (a Server Component nested deep inside
 * `(marketing)/layout.tsx`) tell the persistent header which box the
 * visitor is currently looking at (§ don't make a visitor who already
 * picked a box repeat that choice in WhatsApp). App Router data only
 * flows down from layout to page, never back up — this Provider lives
 * once at the layout level, and any descendant page can call
 * `setActiveBoxName` to update the header without the header needing
 * route params it was never given.
 */
const ActiveBoxNameContext = createContext<{
  activeBoxName: string | null;
  setActiveBoxName: (name: string | null) => void;
} | null>(null);

export function ActiveBoxNameProvider({ children }: { children: ReactNode }) {
  const [activeBoxName, setActiveBoxName] = useState<string | null>(null);
  return (
    <ActiveBoxNameContext.Provider value={{ activeBoxName, setActiveBoxName }}>
      {children}
    </ActiveBoxNameContext.Provider>
  );
}

export function useActiveBoxName(): string | null {
  const context = useContext(ActiveBoxNameContext);
  return context?.activeBoxName ?? null;
}

/** Rendered only by a box's detail page — announces its name for as long as that page stays mounted, then clears it. */
export function SetActiveBoxName({ name }: { name: string }) {
  const context = useContext(ActiveBoxNameContext);
  useEffect(() => {
    context?.setActiveBoxName(name);
    return () => context?.setActiveBoxName(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
  return null;
}
