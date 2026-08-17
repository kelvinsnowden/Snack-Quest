import { requireAdminSection } from '@/lib/auth/requireAdminSection';

export default async function FaqsSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSection('marketing');
  return children;
}
