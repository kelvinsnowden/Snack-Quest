import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { SaleDetailView } from '@/components/vending/SaleDetailView';

export const metadata: Metadata = { title: 'Machine sale' };

export default async function AgentMachineSalePage({ params }: { params: Promise<{ transactionId: string }> }) {
  const session = await requireStaffSession();
  if (!hasPermission(session, 'sales.view')) redirect('/agent');
  const { transactionId } = await params;
  return <SaleDetailView session={session} transactionId={transactionId} basePath="/agent/machine-sales" backHref="/agent/machine-sales" backLabel="Machine sales" machineLinks={false} />;
}
