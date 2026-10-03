import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function ReferralsSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('marketing', 'marketing.campaigns.manage');
  return children;
}
