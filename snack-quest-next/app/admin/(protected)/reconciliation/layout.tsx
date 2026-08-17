import { requireAdminSection } from '@/lib/auth/requireAdminSection';

export default async function ReconciliationSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSection('finance');
  return children;
}
