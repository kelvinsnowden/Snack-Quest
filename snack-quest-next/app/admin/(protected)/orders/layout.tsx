import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function OrdersSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('orders', 'orders.view');
  return children;
}
