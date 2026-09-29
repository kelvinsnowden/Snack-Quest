import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function CustomersSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('marketing', 'customers.view');
  return children;
}
