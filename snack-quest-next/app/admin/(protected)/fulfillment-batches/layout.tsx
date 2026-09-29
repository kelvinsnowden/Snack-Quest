import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function FulfillmentBatchesSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('orders', 'logistics.manage');
  return children;
}
