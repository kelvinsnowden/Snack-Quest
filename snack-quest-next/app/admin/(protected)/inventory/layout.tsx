import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function InventorySectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('orders', 'products.view');
  return children;
}
