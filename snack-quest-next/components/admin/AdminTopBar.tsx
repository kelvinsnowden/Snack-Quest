import { AdminMobileNav } from './AdminMobileNav';
import { AdminUserMenu } from './AdminUserMenu';
import { GlobalSearchTrigger } from './GlobalSearchDialog';
import { ThemeToggle } from './ThemeToggle';
import { LanguageToggle } from './LanguageToggle';
import type { AdminSection } from '@/lib/auth/adminSections';

export function AdminTopBar({
  businessName,
  displayName,
  email,
  role,
  roles,
  visibleSections,
}: {
  businessName: string;
  displayName: string;
  email: string;
  role: string;
  /** Every role on the session — see `AdminUserMenu`, which uses it for the workspace switcher. */
  roles?: readonly string[];
  /** Passed through to the mobile drawer so it hides the same sections the sidebar does (§ Admin mobile UX overhaul). */
  visibleSections: AdminSection[] | null;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-2 md:gap-4 md:px-6">
      <div className="flex min-w-0 items-center gap-1 md:gap-4">
        <AdminMobileNav businessName={businessName} visibleSections={visibleSections} />
        {/* Renders as an icon on mobile and a search bar from `md` up. */}
        <GlobalSearchTrigger />
      </div>
      <div className="flex shrink-0 items-center gap-1 md:gap-2">
        {/*
          Beside the theme switch, because both are "how this portal
          looks to me" rather than anything about the business. Hidden
          on the narrowest phones, where the row is already full — the
          drawer carries it there instead.
        */}
        <LanguageToggle className="hidden sm:inline-flex" />
        <ThemeToggle />
        <AdminUserMenu displayName={displayName} email={email} role={role} roles={roles} />
      </div>
    </header>
  );
}
