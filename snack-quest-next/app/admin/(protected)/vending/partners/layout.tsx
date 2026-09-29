import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function MachineOwnersLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('vending', 'owners.view');
  return children;
}
