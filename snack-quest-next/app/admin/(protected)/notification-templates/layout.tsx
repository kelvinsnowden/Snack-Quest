import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function NotificationTemplatesSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('marketing', 'settings.notifications.manage');
  return children;
}
