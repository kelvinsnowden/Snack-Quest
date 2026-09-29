import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function DiscountCodesLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('marketing', 'marketing.discounts.manage');
  return children;
}
