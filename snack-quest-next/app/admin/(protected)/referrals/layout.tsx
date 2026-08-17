import { requireAdminSection } from '@/lib/auth/requireAdminSection';

export default async function ReferralsSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSection('marketing');
  return children;
}
