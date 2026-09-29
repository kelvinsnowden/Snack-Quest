import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function SmsOptOutsSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('marketing', 'marketing.optouts.manage');
  return children;
}
