import { requireAdminSection } from '@/lib/auth/requireAdminSection';

export default async function MarketingEmailsSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSection('marketing');
  return children;
}
