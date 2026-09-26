'use client';

import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem {
  value: string;
  label: string;
}

/**
 * A minimal, dependency-free tabs primitive — no Radix tabs package
 * exists in this project's dependencies, and pulling one in for a
 * single control would be a heavier addition than writing the real
 * ARIA pattern directly. Panels are pre-rendered elements (often
 * Server Components fetched once by the page), never re-fetched on
 * tab change — switching tabs is a pure client-side visibility
 * toggle. Keyboard support (arrow keys moving focus and selection
 * together, per the WAI-ARIA tabs pattern) and `role="tablist"`/
 * `role="tab"`/`role="tabpanel"` are both real, not decorative.
 */
export function Tabs({ tabs, panels, defaultValue }: { tabs: TabItem[]; panels: Record<string, ReactNode>; defaultValue?: string }) {
  const [active, setActive] = useState(defaultValue ?? tabs[0]?.value);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.value === active);
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setActive(tabs[(index + 1) % tabs.length].value);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setActive(tabs[(index - 1 + tabs.length) % tabs.length].value);
    }
  }

  return (
    <div>
      <div role="tablist" onKeyDown={handleKeyDown} className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            id={`tab-${tab.value}`}
            aria-selected={active === tab.value}
            aria-controls={`tabpanel-${tab.value}`}
            tabIndex={active === tab.value ? 0 : -1}
            onClick={() => setActive(tab.value)}
            className={cn(
              'shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
              active === tab.value ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.value} role="tabpanel" id={`tabpanel-${tab.value}`} aria-labelledby={`tab-${tab.value}`} hidden={active !== tab.value} className="pt-4">
          {panels[tab.value]}
        </div>
      ))}
    </div>
  );
}
