import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function MachineLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('vending', 'machines.view');
  return children;
}
