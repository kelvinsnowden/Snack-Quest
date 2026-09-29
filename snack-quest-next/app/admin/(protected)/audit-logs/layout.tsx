import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function AuditLogsSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('operations', 'audit.view');
  return children;
}
