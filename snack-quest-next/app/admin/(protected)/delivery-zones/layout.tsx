import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function DeliveryZonesSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('orders', 'logistics.view');
  return children;
}
