import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function IntegrationsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('vending', 'integrations.view');
  return children;
}
