/**
 * The Admin portal's own light/dark preference (§ Admin Dashboard
 * redesign) — deliberately separate from any site-wide theme concept.
 * `globals.css`'s own doc comment on `:root[data-theme]` explains why
 * dark mode here is opt-in, never automatic: an OS-driven media query
 * once repainted the public marketing site for every dark-mode visitor
 * with no way back. This toggle only ever runs inside the Admin
 * portal's own layout — see `AdminThemeScript.tsx`/`ThemeToggle.tsx` —
 * and cleans `data-theme` off `<html>` the moment a staff member
 * navigates out of `/admin/*`, so the same accidental bleed can't
 * happen through the back door of client-side navigation.
 *
 * `localStorage`, not a cookie: this is a per-browser display
 * preference for one internal user, not something a server response
 * needs to vary on.
 */
export const ADMIN_THEME_STORAGE_KEY = 'sq-admin-theme';
export type AdminTheme = 'light' | 'dark';
