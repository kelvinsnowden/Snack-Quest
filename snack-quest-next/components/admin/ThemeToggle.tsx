'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ADMIN_THEME_STORAGE_KEY, type AdminTheme } from '@/lib/theme/adminTheme';

/**
 * Admin-only light/dark switch (§ Admin Dashboard redesign). Starts
 * at the fixed default `'light'` — identical to what the server (and
 * this component's own first client hydration pass) renders, so there
 * is no hydration mismatch to suppress. The effect below then syncs
 * from `data-theme`, which `AdminThemeScript` already set on `<html>`
 * before hydration ran, correcting the icon on the next tick. That's
 * a deliberate, harmless extra render — the standard way to read a
 * browser-only value (the DOM attribute, ultimately backed by
 * `localStorage`) without it ever disagreeing with the server's markup.
 *
 * The same effect's cleanup is the other half of why this is safe to
 * leave on `<html>` at all: the moment a staff member navigates
 * outside `/admin/*` (this component's whole subtree unmounts),
 * `data-theme` comes off `<html>` again, so a dark preference chosen
 * here can never bleed onto the public marketing site through
 * client-side navigation.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<AdminTheme>('light');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading data-theme is the intentional sync-from-DOM-after-mount step this comment documents, not an update loop.
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    return () => {
      document.documentElement.removeAttribute('data-theme');
    };
  }, []);

  function toggle() {
    const next: AdminTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(ADMIN_THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing or storage disabled — the toggle still works for this page view.
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {theme === 'dark' ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
    </Button>
  );
}
