import { AdminMobileNav } from './AdminMobileNav';
import { AdminUserMenu } from './AdminUserMenu';
import { GlobalSearchTrigger } from './GlobalSearchDialog';
import { ThemeToggle } from './ThemeToggle';

export function AdminTopBar({
  businessName,
  displayName,
  email,
  role,
}: {
  businessName: string;
  displayName: string;
  email: string;
  role: string;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 md:px-6">
      <AdminMobileNav businessName={businessName} />
      <div className="hidden md:block">
        <GlobalSearchTrigger />
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <AdminUserMenu displayName={displayName} email={email} role={role} />
      </div>
    </header>
  );
}
