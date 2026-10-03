import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function AlertsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('vending', 'alerts.view');
  return children;
}
