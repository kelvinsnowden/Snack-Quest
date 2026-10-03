import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function ReviewsSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('marketing', 'content.manage');
  return children;
}
