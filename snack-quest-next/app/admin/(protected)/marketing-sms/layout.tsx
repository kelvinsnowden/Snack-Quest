import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function MarketingSmsSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('marketing', 'marketing.messages.manage');
  return children;
}
