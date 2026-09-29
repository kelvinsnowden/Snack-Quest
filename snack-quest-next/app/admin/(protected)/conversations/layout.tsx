import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function ConversationsSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('conversations', 'support.conversations.handle');
  return children;
}
