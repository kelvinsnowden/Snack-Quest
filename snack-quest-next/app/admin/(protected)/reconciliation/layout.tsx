import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function ReconciliationSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('finance', 'finance.view');
  return children;
}
