import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function MarketingEmailsSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('marketing', 'marketing.messages.manage');
  return children;
}
