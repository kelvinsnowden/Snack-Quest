import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('vending', 'sales.view');
  return children;
}
