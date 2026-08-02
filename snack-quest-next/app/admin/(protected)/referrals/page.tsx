import type { Metadata } from 'next';
import Link from 'next/link';
import { Megaphone, ReceiptText } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { referralService } from '@/services/referralService';
import { creatorAdminService } from '@/services/creatorAdminService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { CreateReferralLinkDialog, type EligibleCreator } from '@/components/admin/CreateReferralLinkDialog';
import { ReferralLinkActiveToggle } from '@/components/admin/ReferralLinkActiveToggle';
import { formatDate, formatKes } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Referrals' };

export default async function AdminReferralsPage() {
  const session = await requireStaffSession();

  const [{ links }, { commissions }, { creators: activeCreators }] = await Promise.all([
    referralService.listLinks(session.businessId),
    referralService.listCommissions(session.businessId),
    creatorAdminService.listCreators(session.businessId, { status: 'active' }),
  ]);

  const eligibleCreators: EligibleCreator[] = activeCreators.map((c) => ({
    uid: c.uid,
    displayName: c.user?.displayName ?? 'Unknown',
    email: c.user?.email ?? c.uid,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Referrals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Referral links creators share, and the commissions they&apos;ve earned. Commissions are credited
          automatically the moment an order uses a valid code — this is oversight, not an approval queue.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Referral links</CardTitle>
          <CreateReferralLinkDialog creators={eligibleCreators} />
        </CardHeader>
        <CardContent className="p-0">
          {links.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Megaphone}
                title="No referral links yet"
                description={
                  eligibleCreators.length === 0
                    ? 'Approve a creator first, then create their first referral link here.'
                    : 'Create a code for one of your active creators to start tracking referrals.'
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium">Creator</th>
                    <th className="px-4 py-3 font-medium">Discount</th>
                    <th className="px-4 py-3 font-medium">Commission</th>
                    <th className="px-4 py-3 font-medium">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map(({ id, data, owner }) => (
                    <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                      <td className="px-4 py-3 font-medium tabular-nums text-foreground">{data.code}</td>
                      <td className="px-4 py-3 text-foreground">{owner?.displayName ?? data.ownerId}</td>
                      <td className="px-4 py-3 tabular-nums text-foreground">{formatKes(data.discountKes)}</td>
                      <td className="px-4 py-3 tabular-nums text-foreground">{formatKes(data.commissionKes)}</td>
                      <td className="px-4 py-3">
                        <ReferralLinkActiveToggle linkId={id} isActive={data.isActive} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent commissions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {commissions.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={ReceiptText}
                title="No commissions yet"
                description="Awarded commissions appear here as soon as a customer completes an order with a referral code."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">Creator</th>
                    <th className="px-4 py-3 font-medium">Commission</th>
                    <th className="px-4 py-3 font-medium">Discount given</th>
                    <th className="px-4 py-3 font-medium">Order</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map(({ id, data, creator }) => (
                    <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                      <td className="px-4 py-3 text-foreground">{creator?.displayName ?? data.creatorId}</td>
                      <td className="px-4 py-3 font-medium tabular-nums text-foreground">{formatKes(data.commissionKes)}</td>
                      <td className="px-4 py-3 tabular-nums text-foreground">{formatKes(data.discountKes)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/orders/${data.orderId}`} className="text-primary hover:underline">
                          View order
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDate(data.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
