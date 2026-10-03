import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function CampaignsSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('marketing', 'marketing.campaigns.manage');
  return children;
}
