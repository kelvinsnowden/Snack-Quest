import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireStaffSession } from '@/lib/auth/session';
import { businessRepository } from '@/repositories/businessRepository';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminTopBar } from '@/components/admin/AdminTopBar';

export const metadata: Metadata = {
  title: {
    default: 'Snack Quest Admin',
    template: '%s — Snack Quest Admin',
  },
};

/**
 * The Secure tier of the auth check (§ Admin auth foundation) — the
 * one place every `/admin/*` page actually gets protected. `proxy.ts`
 * only redirected obviously-signed-out requests before this ever ran;
 * this is the real verification (Firebase Admin session-cookie check
 * + a fresh Firestore read), matching Next.js's own recommended
 * Optimistic/Secure split.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaffSession();

  // An agent-only account (no admin/super_admin role) has a focused
  // workspace of its own now (§ Human Sales Agent workspace) — this
  // full portal isn't built for them (Products, Inventory, Withdrawals,
  // Settings, ...), so send them there instead of rendering it anyway.
  // Roles without a dedicated workspace yet (warehouse, finance) still
  // fall through to this portal, same as before.
  const isAgentOnly =
    session.roles.includes('agent') && !session.roles.some((role) => role === 'admin' || role === 'super_admin');
  if (isAgentOnly) {
    redirect('/agent');
  }

  const business = await businessRepository.findById(session.businessId);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AdminSidebar businessName={business?.name ?? 'Snack Quest'} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar
          businessName={business?.name ?? 'Snack Quest'}
          displayName={session.displayName}
          email={session.email}
          role={session.roles[0] ?? 'staff'}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
