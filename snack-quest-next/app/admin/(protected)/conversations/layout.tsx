import { requireAdminSection } from '@/lib/auth/requireAdminSection';

export default async function ConversationsSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSection('conversations');
  return children;
}
