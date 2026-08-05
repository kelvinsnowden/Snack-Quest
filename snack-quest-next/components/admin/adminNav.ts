import type { LucideIcon } from 'lucide-react';
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
  MapPinned,
  Megaphone,
  MessageCircle,
  Package,
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
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/orders', label: 'Orders', icon: ClipboardList },
  { href: '/admin/products', label: 'Products', icon: Package },
  { href: '/admin/faqs', label: 'FAQ', icon: HelpCircle },
  { href: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { href: '/admin/purchase-orders', label: 'Purchase orders', icon: ClipboardCheck },
  { href: '/admin/suppliers', label: 'Suppliers', icon: Warehouse },
  { href: '/admin/customers', label: 'Customers', icon: Users },
  { href: '/admin/creators', label: 'Creators', icon: Megaphone },
  { href: '/admin/campaigns', label: 'Campaigns', icon: Flag },
  { href: '/admin/referrals', label: 'Referrals', icon: Share2 },
  { href: '/admin/withdrawals', label: 'Withdrawals', icon: Banknote },
  { href: '/admin/reconciliation', label: 'Reconciliation', icon: Scale },
  { href: '/admin/deliveries', label: 'Deliveries', icon: Truck },
  { href: '/admin/delivery-zones', label: 'Delivery zones', icon: MapPinned },
  { href: '/admin/conversations', label: 'Conversations', icon: MessageCircle },
  { href: '/admin/storage', label: 'Storage', icon: FolderOpen },
  { href: '/admin/operations', label: 'Operations', icon: Activity },
  { href: '/admin/audit-logs', label: 'Audit logs', icon: ScrollText },
  { href: '/admin/staff', label: 'Staff', icon: UserCog },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

/** `/admin` only matches its own page exactly; every other section also matches its own detail sub-routes (e.g. `/admin/orders/abc123`). */
export function isNavItemActive(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
