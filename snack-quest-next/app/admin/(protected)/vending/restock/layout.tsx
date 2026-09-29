import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function RestockLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('vending', 'restock.view');
  return children;
}
