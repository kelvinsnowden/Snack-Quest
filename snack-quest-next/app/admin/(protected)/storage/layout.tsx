import { requireAdminSection } from '@/lib/auth/requireAdminSection';

export default async function StorageSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSection('operations');
  return children;
}
