import type { Metadata } from 'next';
import { requireStaffSession } from '@/lib/auth/session';
import { SaleReviewQueue } from '@/components/vending/SaleReviewQueue';

export const metadata: Metadata = { title: 'Sales to Review' };

export default async function SalesReviewPage() {
  const session = await requireStaffSession();
  return <SaleReviewQueue businessId={session.businessId} basePath="/admin/vending/sales" back={{ href: '/admin/vending/sales', label: 'All sales' }} />;
}
