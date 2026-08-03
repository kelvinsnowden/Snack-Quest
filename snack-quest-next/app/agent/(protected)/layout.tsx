import type { Metadata } from 'next';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { requireStaffSession } from '@/lib/auth/session';
import { businessRepository } from '@/repositories/businessRepository';
import { AdminUserMenu } from '@/components/admin/AdminUserMenu';

export const metadata: Metadata = {
  title: {
    default: 'Snack Quest Agent',
    template: '%s — Snack Quest Agent',
  },
};

/**
 * The Human Sales Agent workspace's own shell — deliberately not
 * `/admin/*` (§ Human Sales Agent workspace). An agent's whole job is
 * "work my assigned conversations": no products, inventory, withdrawals,
 * or settings navigation to get lost in, just a focused queue + detail
 * view. Staff auth (`requireStaffSession`) is shared with `/admin` —
 * one login, one session cookie — but role-gated here: `warehouse`/
 * `finance` staff have their own workspaces coming (§ Warehouse/Finance
 * workspace) and don't belong on this one; `admin`/`super_admin` can
 * still reach it for oversight/testing.
 */
export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaffSession('/admin/login?next=%2Fagent');
  const canUseAgentWorkspace = session.roles.some((role) => role === 'agent' || role === 'admin' || role === 'super_admin');
  if (!canUseAgentWorkspace) {
    redirect('/admin');
  }

  const business = await businessRepository.findById(session.businessId);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 md:px-6">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="Snack Quest" width={32} height={32} className="size-8 rounded-lg object-cover" />
          <span className="font-semibold text-foreground">{business?.name ?? 'Snack Quest'} Agent</span>
        </div>
        <AdminUserMenu displayName={session.displayName} email={session.email} role={session.roles[0] ?? 'agent'} />
      </header>
      <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
    </div>
  );
}
