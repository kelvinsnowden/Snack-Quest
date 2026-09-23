import { requireAdminSection } from '@/lib/auth/requireAdminSection';

export default async function VendingSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSection('vending');
  return children;
}
