import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function KioskScreenLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('vending', 'machine_screen.manage');
  return children;
}
