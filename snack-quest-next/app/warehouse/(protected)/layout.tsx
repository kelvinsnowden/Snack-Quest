import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaffSession } from '@/lib/auth/session';
import { businessRepository } from '@/repositories/businessRepository';
import { AdminUserMenu } from '@/components/admin/AdminUserMenu';

const NAV_ITEMS = [
  { href: '/warehouse', label: 'Queue' },
  { href: '/warehouse/recipes', label: 'Recipes' },
  { href: '/warehouse/shopping', label: 'Shopping' },
  { href: '/warehouse/inventory', label: 'Inventory' },
];

export const metadata: Metadata = {
  title: {
    default: 'Snack Quest Warehouse',
    template: '%s — Snack Quest Warehouse',
  },
};

/**
 * The Warehouse workspace's own shell (§ Warehouse workspace) — same
 * pattern as `/agent`: a focused shell, not the full `/admin` portal.
 * Role-gated to `warehouse`/`admin`/`super_admin`; a warehouse-only
 * session hitting `/admin` bounces here (see that layout's own note).
 */
export default async function WarehouseLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaffSession('/admin/login?next=%2Fwarehouse');
  const canUseWarehouseWorkspace = session.roles.some(
    (role) => role === 'warehouse' || role === 'admin' || role === 'super_admin',
  );
  if (!canUseWarehouseWorkspace) {
    redirect('/admin');
  }

  const business = await businessRepository.findById(session.businessId);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 md:px-6">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="Snack Quest" width={32} height={32} className="size-8 rounded-lg object-cover" />
            <span className="font-semibold text-foreground">{business?.name ?? 'Snack Quest'} Warehouse</span>
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
        <AdminUserMenu displayName={session.displayName} email={session.email} role={session.roles[0] ?? 'warehouse'} />
      </header>
      <main className="flex-1 overflow-y-auto p-4 pb-20 sm:pb-4 md:p-8">{children}</main>
      {/*
        The header nav is `sm:flex`, so until now a phone had no
        navigation at all — on a workspace whose users are, by
        definition, holding a phone. This is the whole nav for them:
        pinned to the bottom where a thumb reaches, four equal targets,
        no menu to open first.
      */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface/95 backdrop-blur sm:hidden">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 text-caption font-medium text-muted-foreground active:bg-border/40"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
