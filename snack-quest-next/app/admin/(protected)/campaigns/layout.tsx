import { requireAdminSection } from '@/lib/auth/requireAdminSection';

export default async function CampaignsSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSection('marketing');
  return children;
}
