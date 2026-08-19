import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { withdrawalRepository } from '@/repositories/withdrawalRepository';
import { userRepository } from '@/repositories/userRepository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WithdrawalStatusBadge } from '@/components/admin/WithdrawalStatusBadge';
import { WithdrawalActions } from '@/components/admin/WithdrawalActions';
import { formatDateTime, formatKes } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Withdrawal detail' };

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

export default async function AdminWithdrawalDetailPage({
  params,
}: {
  params: Promise<{ withdrawalId: string }>;
}) {
  const session = await requireStaffSession();
  const { withdrawalId } = await params;

  const withdrawal = await withdrawalRepository.findById(session.businessId, withdrawalId);
  if (!withdrawal) {
    notFound();
  }

  const owner = await userRepository.findById(withdrawal.ownerId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/admin/withdrawals"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Withdrawals
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{owner?.displayName ?? withdrawal.ownerId}</h1>
            <WithdrawalStatusBadge status={withdrawal.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatKes(withdrawal.amountKes)} · {withdrawal.phoneNumber}
          </p>
        </div>
        {withdrawal.status === 'pending' ? (
          <WithdrawalActions withdrawalId={withdrawalId} amountKes={withdrawal.amountKes} />
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow label="Owner type" value={<span className="capitalize">{withdrawal.ownerType}</span>} />
            <DetailRow label="Amount" value={formatKes(withdrawal.amountKes)} />
            <DetailRow label="Phone number" value={<span className="tabular-nums">{withdrawal.phoneNumber}</span>} />
            <DetailRow label="Requested" value={formatDateTime(withdrawal.createdAt)} />
            {withdrawal.approvedAt ? <DetailRow label="Approved" value={formatDateTime(withdrawal.approvedAt)} /> : null}
            {withdrawal.paidAt ? <DetailRow label="Paid" value={formatDateTime(withdrawal.paidAt)} /> : null}
            {withdrawal.rejectionReason ? <DetailRow label="Rejection reason" value={withdrawal.rejectionReason} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daraja B2C</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow
              label="Originator conversation"
              value={<span className="text-xs tabular-nums">{withdrawal.b2cOriginatorConversationId ?? '—'}</span>}
            />
            <DetailRow
              label="Conversation ID"
              value={<span className="text-xs tabular-nums">{withdrawal.b2cConversationId ?? '—'}</span>}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Audit trail</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {withdrawal.auditTrail.map((entry, index) => (
            <div key={index} className="flex items-baseline justify-between gap-4 py-2 text-sm">
              <div>
                <p className="font-medium text-foreground capitalize">{entry.action.replace(/_/g, ' ')}</p>
                {entry.note ? <p className="text-caption text-muted-foreground">{entry.note}</p> : null}
              </div>
              <span className="shrink-0 text-caption text-muted-foreground tabular-nums">{formatDateTime(entry.at)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
