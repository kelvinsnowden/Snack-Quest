import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function FulfilmentCostsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('orders', 'orders.costs.bulk');
  return children;
}
