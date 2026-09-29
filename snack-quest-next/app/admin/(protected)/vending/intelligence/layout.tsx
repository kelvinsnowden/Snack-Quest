import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function IntelligenceLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('vending', 'analytics.vending.view');
  return children;
}
