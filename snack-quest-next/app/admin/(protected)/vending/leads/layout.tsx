import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function VendingLeadsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('vending', 'owners.view');
  return children;
}
