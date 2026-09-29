import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function CreatorsSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('marketing', 'creators.manage');
  return children;
}
