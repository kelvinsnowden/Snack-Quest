import { requireAdminSection } from '@/lib/auth/requireAdminSection';

export default async function WithdrawalsSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSection('finance');
  return children;
}
