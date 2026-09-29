import type { Metadata } from 'next';
import { requireStaffSession } from '@/lib/auth/session';
import { SaleDetailView } from '@/components/vending/SaleDetailView';

export const metadata: Metadata = { title: 'Sale' };

export default async function SaleDetailPage({ params }: { params: Promise<{ transactionId: string }> }) {
  const session = await requireStaffSession();
  const { transactionId } = await params;
  return <SaleDetailView session={session} transactionId={transactionId} basePath="/admin/vending/sales" backHref="/admin/vending/sales/review" backLabel="Sales to review" />;
}
