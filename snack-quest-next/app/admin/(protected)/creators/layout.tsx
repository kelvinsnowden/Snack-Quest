import { requireAdminSection } from '@/lib/auth/requireAdminSection';

export default async function CreatorsSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSection('marketing');
  return children;
}
