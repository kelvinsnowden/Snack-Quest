import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaffSession } from '@/lib/auth/session';
import { businessRepository } from '@/repositories/businessRepository';
import { AdminUserMenu } from '@/components/admin/AdminUserMenu';

export const metadata: Metadata = {
  title: {
    default: 'Snack Quest Finance',
    template: '%s — Snack Quest Finance',
  },
};

const NAV_ITEMS = [
  { href: '/finance', label: 'Withdrawals' },
  { href: '/finance/commissions', label: 'Commissions' },
  { href: '/finance/refunds', label: 'Refunds' },
  { href: '/finance/reconciliation', label: 'Reconciliation' },
  { href: '/finance/revenue', label: 'Revenue' },
];

/**
 * The Finance workspace's own shell (§ Finance workspace) — same
 * focused-shell pattern as `/agent` and `/warehouse`. Role-gated to
 * `finance`/`admin`/`super_admin`; a finance-only session hitting
 * `/admin` bounces here (see that layout's own note).
 *
 * This workspace covers what's real today — withdrawal approvals +
 * Daraja B2C (§ Admin: Withdrawals), the commission ledger (§ Admin:
 * Referrals), revenue reporting (§ Admin: Analytics), the refund ledger
 * (§ RefundService + Daraja reversal support — refund initiation itself
 * lives on the order detail page in `/admin/orders`, where the
 * order-specific context already is), and the unmatched-payments
 * reconciliation queue (§ Payment reconciliation), all reused rather
 * than rebuilt.
 */
export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaffSession('/admin/login?next=%2Ffinance');
  const canUseFinanceWorkspace = session.roles.some(
    (role) => role === 'finance' || role === 'admin' || role === 'super_admin',
  );
  if (!canUseFinanceWorkspace) {
    redirect('/admin');
  }

  const business = await businessRepository.findById(session.businessId);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 md:px-6">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              SQ
            </div>
            <span className="font-semibold text-foreground">{business?.name ?? 'Snack Quest'} Finance</span>
          </div>
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-border/40 hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <AdminUserMenu displayName={session.displayName} email={session.email} role={session.roles[0] ?? 'finance'} />
      </header>
      <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
    </div>
  );
}
