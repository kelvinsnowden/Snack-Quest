import type { LucideIcon } from 'lucide-react';
import type { AdminSection } from '@/lib/auth/adminSections';
import {
  Banknote,
  BarChart3,
  Boxes,
  ClipboardList,
  ClipboardCheck,
  Activity,
  Flag,
  FolderOpen,
  HelpCircle,
  LayoutDashboard,
  Mail,
  MailPlus,
  ChefHat,
  Cookie,
  MessageSquare,
  BellOff,
  MapPinned,
  Megaphone,
  MessageCircle,
  MessageSquareQuote,
  Package,
  PackageSearch,
  Scale,
  ScrollText,
  Settings,
  Share2,
  Truck,
  UserCog,
  Users,
  Warehouse,
} from 'lucide-react';

/**
 * The Admin Portal's real navigation — every entry here has a real,
 * working page behind it today. Deliberately not pre-populated with
 * the full eventual section list (Orders, Products, Inventory, ...):
 * each one is added to this array in the same change that ships its
 * real page, never before, so the sidebar never links to something
 * that isn't actually built yet.
 */
/**
 * Which part of running the business a page belongs to (§ Admin mobile
 * UX overhaul). Twenty-six equally-weighted links is a wall to scan on
 * a desktop rail and unusable in a phone drawer, where the last third
 * sits below the fold — grouping turns "read every label" into "pick a
 * heading, then pick a page".
 *
 * Ordered by how often a working day touches them: what happened, what
 * was ordered, what has to ship, who bought it, who promoted it, the
 * money, then the things that are set up once and rarely revisited.
 */
export type AdminNavGroup =
  | 'Overview'
  | 'Orders & delivery'
  | 'Catalogue & stock'
  | 'Customers'
  | 'Creators'
  | 'Money'
  | 'Marketing'
  | 'System';

export const ADMIN_NAV_GROUP_ORDER: AdminNavGroup[] = [
  'Overview',
  'Orders & delivery',
  'Catalogue & stock',
  'Customers',
  'Creators',
  'Money',
  'Marketing',
  'System',
];

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Which per-workspace toggle (§ Staff access control) gates this page — absent means every staff member with Admin Portal access sees it (Dashboard, Analytics, Staff). */
  section?: AdminSection;
  /**
   * A compact name for the phone's bottom bar, where a slot is about
   * a fifth of the screen. Only set where the full label would be
   * truncated there; everywhere else (sidebar, drawer, search) keeps
   * `label`, which stays the unambiguous one.
   */
  shortLabel?: string;
  group: AdminNavGroup;
  /**
   * Reachable from the phone's bottom bar without opening the drawer
   * (§ Admin mobile UX overhaul). Reserved for the handful of pages a
   * working day returns to constantly — every other page is one tap
   * further, behind "More".
   */
  quickAccess?: true;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, group: 'Overview', quickAccess: true },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, group: 'Overview' },

  { href: '/admin/orders', label: 'Orders', icon: ClipboardList, section: 'orders', group: 'Orders & delivery', quickAccess: true },
  { href: '/admin/deliveries', label: 'Deliveries', icon: Truck, section: 'orders', group: 'Orders & delivery', quickAccess: true },
  { href: '/admin/fulfillment-batches', label: 'Fulfillment batches', shortLabel: 'Batches', icon: PackageSearch, section: 'orders', group: 'Orders & delivery', quickAccess: true },
  { href: '/admin/delivery-zones', label: 'Delivery zones', icon: MapPinned, section: 'orders', group: 'Orders & delivery' },

  { href: '/admin/products', label: 'Products', icon: Package, section: 'orders', group: 'Catalogue & stock' },
  { href: '/admin/inventory', label: 'Inventory', icon: Boxes, section: 'orders', group: 'Catalogue & stock' },
  { href: '/admin/snack-items', label: 'Snacks', icon: Cookie, section: 'orders', group: 'Catalogue & stock' },
  { href: '/admin/recipes', label: 'Box recipes', shortLabel: 'Recipes', icon: ChefHat, section: 'orders', group: 'Catalogue & stock' },
  { href: '/admin/purchase-orders', label: 'Purchase orders', icon: ClipboardCheck, section: 'orders', group: 'Catalogue & stock' },
  { href: '/admin/suppliers', label: 'Suppliers', icon: Warehouse, section: 'orders', group: 'Catalogue & stock' },

  { href: '/admin/conversations', label: 'Conversations', icon: MessageCircle, section: 'conversations', group: 'Customers' },
  { href: '/admin/customers', label: 'Customers', icon: Users, section: 'marketing', group: 'Customers' },
  { href: '/admin/reviews', label: 'Reviews', icon: MessageSquareQuote, section: 'marketing', group: 'Customers' },

  { href: '/admin/creators', label: 'Creators', icon: Megaphone, section: 'marketing', group: 'Creators' },
  { href: '/admin/campaigns', label: 'Campaigns', icon: Flag, section: 'marketing', group: 'Creators' },
  { href: '/admin/referrals', label: 'Referrals', icon: Share2, section: 'marketing', group: 'Creators' },

  { href: '/admin/withdrawals', label: 'Withdrawals', icon: Banknote, section: 'finance', group: 'Money' },
  { href: '/admin/reconciliation', label: 'Reconciliation', icon: Scale, section: 'finance', group: 'Money' },

  { href: '/admin/faqs', label: 'FAQ', icon: HelpCircle, section: 'marketing', group: 'Marketing' },
  { href: '/admin/marketing-emails', label: 'Marketing Emails', icon: Mail, section: 'marketing', group: 'Marketing' },
  { href: '/admin/marketing-sms', label: 'Marketing SMS', shortLabel: 'SMS', icon: MessageSquare, section: 'marketing', group: 'Marketing' },
  { href: '/admin/sms-opt-outs', label: 'SMS opt-outs', shortLabel: 'Opt-outs', icon: BellOff, section: 'marketing', group: 'Marketing' },
  { href: '/admin/notification-templates', label: 'Notification Templates', icon: MailPlus, section: 'marketing', group: 'Marketing' },

  { href: '/admin/storage', label: 'Storage', icon: FolderOpen, section: 'operations', group: 'System' },
  { href: '/admin/operations', label: 'Operations', icon: Activity, section: 'operations', group: 'System' },
  { href: '/admin/audit-logs', label: 'Audit logs', icon: ScrollText, section: 'operations', group: 'System' },
  { href: '/admin/staff', label: 'Staff', icon: UserCog, group: 'System' },
  { href: '/admin/settings', label: 'Settings', icon: Settings, section: 'operations', group: 'System' },
];

/** Filters the nav for a session's actual access — `visibleSections: null` means unrestricted (every item shows). */
export function visibleNavItems(visibleSections: AdminSection[] | null): AdminNavItem[] {
  if (visibleSections === null) {
    return ADMIN_NAV_ITEMS;
  }
  return ADMIN_NAV_ITEMS.filter((item) => !item.section || visibleSections.includes(item.section));
}

/**
 * The same items, bucketed by group and keeping array order within
 * each. Empty groups are dropped rather than rendered as a heading
 * with nothing under it — a restricted staff member should see a
 * shorter menu, never a hollow one.
 */
export function groupedNavItems(
  items: AdminNavItem[],
): { group: AdminNavGroup; items: AdminNavItem[] }[] {
  return ADMIN_NAV_GROUP_ORDER.map((group) => ({
    group,
    items: items.filter((item) => item.group === group),
  })).filter((entry) => entry.items.length > 0);
}

/**
 * What the phone's bottom bar offers directly. Capped so the row never
 * becomes a scrolling strip of tiny targets — the cap is a layout
 * constraint, not a preference, since a fifth slot always belongs to
 * "More".
 */
export const MAX_QUICK_ACCESS_ITEMS = 4;

export function quickAccessNavItems(items: AdminNavItem[]): AdminNavItem[] {
  return items.filter((item) => item.quickAccess).slice(0, MAX_QUICK_ACCESS_ITEMS);
}

/** `/admin` only matches its own page exactly; every other section also matches its own detail sub-routes (e.g. `/admin/orders/abc123`). */
export function isNavItemActive(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
