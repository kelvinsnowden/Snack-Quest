import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function FaqsSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('marketing', 'content.manage');
  return children;
}
