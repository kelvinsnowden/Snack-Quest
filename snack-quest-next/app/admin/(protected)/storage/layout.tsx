import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function StorageSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('operations', 'settings.view');
  return children;
}
