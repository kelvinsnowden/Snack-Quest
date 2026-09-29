import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function DeliveriesSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('orders', 'orders.view');
  return children;
}
