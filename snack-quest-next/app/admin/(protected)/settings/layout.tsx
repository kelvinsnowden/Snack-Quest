import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function SettingsSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('operations', 'settings.view');
  return children;
}
