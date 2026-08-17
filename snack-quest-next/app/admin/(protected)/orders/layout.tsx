import { requireAdminSection } from '@/lib/auth/requireAdminSection';

export default async function OrdersSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSection('orders');
  return children;
}
