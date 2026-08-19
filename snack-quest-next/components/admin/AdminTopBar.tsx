import { AdminMobileNav } from './AdminMobileNav';
import { AdminUserMenu } from './AdminUserMenu';
import { GlobalSearchTrigger } from './GlobalSearchDialog';
import { ThemeToggle } from './ThemeToggle';
import type { AdminSection } from '@/lib/auth/adminSections';

export function AdminTopBar({
  businessName,
  displayName,
  email,
  role,
  visibleSections,
}: {
  businessName: string;
  displayName: string;
  email: string;
  role: string;
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
        <ThemeToggle />
        <AdminUserMenu displayName={displayName} email={email} role={role} />
      </div>
    </header>
  );
}
