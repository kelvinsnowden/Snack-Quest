import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireStaffSession } from '@/lib/auth/session';
import { ViewAsSwitcher } from '@/components/admin/ViewAsSwitcher';
import { visibleAdminSections } from '@/lib/auth/adminSections';
import { businessRepository } from '@/repositories/businessRepository';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminTopBar } from '@/components/admin/AdminTopBar';
import { AdminBottomBar } from '@/components/admin/AdminBottomBar';
import { LocaleProvider } from '@/components/admin/i18n/LocaleProvider';
import { getLocale } from '@/lib/i18n/getLocale';
import { LOCALE_HTML_LANG } from '@/lib/i18n/locales';

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

  // An agent-only, warehouse-only, or finance-only account (no
  // admin/super_admin role) has a focused workspace of its own now
  // (§ Human Sales Agent workspace, § Warehouse workspace, § Finance
  // workspace) — this full portal isn't built for them, so send them
  // there instead of rendering it anyway.
  const isStaffOnly = (role: 'agent' | 'warehouse' | 'finance') =>
    session.roles.includes(role) && !session.roles.some((r) => r === 'admin' || r === 'super_admin');
  if (isStaffOnly('agent')) {
    redirect('/agent');
  }
  if (isStaffOnly('warehouse')) {
    redirect('/warehouse');
  }
  if (isStaffOnly('finance')) {
    redirect('/finance');
  }

  const [business, locale] = await Promise.all([
    businessRepository.findById(session.businessId),
    // Read here, once, and handed to every Client Component below —
    // see `LocaleProvider` for why this is a context and not a prop
    // threaded through dozens of signatures.
    getLocale(),
  ]);
  const visibleSections = visibleAdminSections(session);

  return (
    <LocaleProvider locale={locale}>
    {/*
      `lang` on this wrapper rather than on `<html>`. Only the root
      layout renders the document element, and it is shared with the
      public marketing site — declaring the whole document Chinese
      because a staff member set their portal to Chinese would mislabel
      every English page they then visit. `lang` is valid on any
      element and assistive technology honours the nearest one, so
      scoping it to the portal is both correct and narrower.
    */}
    <div lang={LOCALE_HTML_LANG[locale]} className="flex h-screen overflow-hidden bg-background">
      <AdminSidebar
        businessName={business?.name ?? 'Snack Quest'}
        visibleSections={visibleSections}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar
          businessName={business?.name ?? 'Snack Quest'}
          displayName={session.displayName}
          email={session.email}
          role={session.roles[0] ?? 'staff'}
          visibleSections={visibleSections}
        />
        {/*
          A super admin's own controls (§ see it from every angle) —
          the roles they can look through, or the way back out of one.
          Only ever rendered for a super admin, so nobody else is
          offered a switch they cannot make.
        */}
        {session.viewingAs || session.actualRoles?.includes('super_admin') || session.roles.includes('super_admin') ? (
          <ViewAsSwitcher viewingAs={session.viewingAs} />
        ) : null}
        {/*
          The bottom padding reserves the phone's quick-nav bar, so the
          last row of a table or the last field of a form is never
          trapped beneath it (§ Admin mobile UX overhaul). It collapses
          from `md` up, where that bar isn't rendered at all.
        */}
        <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-8 md:pb-8">{children}</main>
      </div>
      <AdminBottomBar visibleSections={visibleSections} />
    </div>
    </LocaleProvider>
  );
}
