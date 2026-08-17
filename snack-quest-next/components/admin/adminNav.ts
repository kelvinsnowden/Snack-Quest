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
export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Which per-workspace toggle (§ Staff access control) gates this page — absent means every staff member with Admin Portal access sees it (Dashboard, Analytics, Staff). */
  section?: AdminSection;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/orders', label: 'Orders', icon: ClipboardList, section: 'orders' },
  { href: '/admin/products', label: 'Products', icon: Package, section: 'orders' },
  { href: '/admin/faqs', label: 'FAQ', icon: HelpCircle, section: 'marketing' },
  { href: '/admin/reviews', label: 'Reviews', icon: MessageSquareQuote, section: 'marketing' },
  { href: '/admin/inventory', label: 'Inventory', icon: Boxes, section: 'orders' },
  { href: '/admin/purchase-orders', label: 'Purchase orders', icon: ClipboardCheck, section: 'orders' },
  { href: '/admin/fulfillment-batches', label: 'Fulfillment batches', icon: PackageSearch, section: 'orders' },
  { href: '/admin/suppliers', label: 'Suppliers', icon: Warehouse, section: 'orders' },
  { href: '/admin/customers', label: 'Customers', icon: Users, section: 'marketing' },
  { href: '/admin/creators', label: 'Creators', icon: Megaphone, section: 'marketing' },
  { href: '/admin/campaigns', label: 'Campaigns', icon: Flag, section: 'marketing' },
  { href: '/admin/referrals', label: 'Referrals', icon: Share2, section: 'marketing' },
  { href: '/admin/marketing-emails', label: 'Marketing Emails', icon: Mail, section: 'marketing' },
  { href: '/admin/notification-templates', label: 'Notification Templates', icon: MailPlus, section: 'marketing' },
  { href: '/admin/withdrawals', label: 'Withdrawals', icon: Banknote, section: 'finance' },
  { href: '/admin/reconciliation', label: 'Reconciliation', icon: Scale, section: 'finance' },
  { href: '/admin/deliveries', label: 'Deliveries', icon: Truck, section: 'orders' },
  { href: '/admin/delivery-zones', label: 'Delivery zones', icon: MapPinned, section: 'orders' },
  { href: '/admin/conversations', label: 'Conversations', icon: MessageCircle, section: 'conversations' },
  { href: '/admin/storage', label: 'Storage', icon: FolderOpen, section: 'operations' },
  { href: '/admin/operations', label: 'Operations', icon: Activity, section: 'operations' },
  { href: '/admin/audit-logs', label: 'Audit logs', icon: ScrollText, section: 'operations' },
  { href: '/admin/staff', label: 'Staff', icon: UserCog },
  { href: '/admin/settings', label: 'Settings', icon: Settings, section: 'operations' },
];

/** Filters the nav for a session's actual access — `visibleSections: null` means unrestricted (every item shows). */
export function visibleNavItems(visibleSections: AdminSection[] | null): AdminNavItem[] {
  if (visibleSections === null) {
    return ADMIN_NAV_ITEMS;
  }
  return ADMIN_NAV_ITEMS.filter((item) => !item.section || visibleSections.includes(item.section));
}

/** `/admin` only matches its own page exactly; every other section also matches its own detail sub-routes (e.g. `/admin/orders/abc123`). */
export function isNavItemActive(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
