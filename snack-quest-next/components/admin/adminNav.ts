import type { LucideIcon } from 'lucide-react';
import { ClipboardList, LayoutDashboard } from 'lucide-react';

/**
 * The Admin Portal's real navigation — every entry here has a real,
 * working page behind it today. Deliberately not pre-populated with
 * the full eventual section list (Orders, Products, Inventory, ...):
 * each one is added to this array in the same change that ships its
 * real page, never before, so the sidebar never links to something
 * that isn't actually built yet.
 */
export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/orders', label: 'Orders', icon: ClipboardList },
];

/** `/admin` only matches its own page exactly; every other section also matches its own detail sub-routes (e.g. `/admin/orders/abc123`). */
export function isNavItemActive(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
