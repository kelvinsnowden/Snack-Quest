import type { Metadata } from 'next';
import Link from 'next/link';
import { Megaphone, ReceiptText } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { referralService } from '@/services/referralService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ReferralLinkActiveToggle } from '@/components/admin/ReferralLinkActiveToggle';
import { formatDate, formatKes } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Referrals' };

export default async function AdminReferralsPage({
  searchParams,
}: {
  searchParams: Promise<{ linksCursor?: string; commissionsCursor?: string }>;
}) {
  const session = await requireStaffSession();
  const { linksCursor, commissionsCursor } = await searchParams;

  const [
    { links, nextCursor: nextLinksCursor },
    { commissions, nextCursor: nextCommissionsCursor },
  ] = await Promise.all([
    referralService.listLinks(session.businessId, { cursor: linksCursor }),
    referralService.listCommissions(session.businessId, {
      cursor: commissionsCursor,
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title text-foreground font-bold tracking-tight">
          Referrals
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Every creator gets one permanent referral link automatically at
          registration — a fixed KES 250 customer discount and a commission
          locked in by their real registration order. Commissions are credited
          automatically the moment an order uses a valid code; the only lever
          here is pausing a link, e.g. for suspected fraud.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Referral links</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {links.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Megaphone}
                title="No referral links yet"
                description="A link is provisioned automatically the moment a creator registers — none have registered yet."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-border bg-border/20 text-caption text-muted-foreground border-b text-left uppercase">
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
                    <tr
                      key={id}
                      className="border-border hover:bg-border/20 border-b last:border-0"
                    >
                      <td className="text-foreground px-4 py-3 font-medium tabular-nums">
                        {data.code}
                      </td>
                      <td className="text-foreground px-4 py-3">
                        {owner?.displayName ?? data.ownerId}
                      </td>
                      <td className="text-foreground px-4 py-3 tabular-nums">
                        {formatKes(data.discountKes)}
                      </td>
                      <td className="text-foreground px-4 py-3 tabular-nums">
                        {formatKes(data.commissionKes)}
                      </td>
                      <td className="px-4 py-3">
                        <ReferralLinkActiveToggle
                          linkId={id}
                          isActive={data.isActive}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        {nextLinksCursor ? (
          <div className="border-border flex justify-center border-t p-4">
            <Button asChild variant="outline">
              <Link
                href={`/admin/referrals?linksCursor=${nextLinksCursor}${commissionsCursor ? `&commissionsCursor=${commissionsCursor}` : ''}`}
              >
                Load more links
              </Link>
            </Button>
          </div>
        ) : null}
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
                <thead className="border-border bg-border/20 text-caption text-muted-foreground border-b text-left uppercase">
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
                    <tr
                      key={id}
                      className="border-border hover:bg-border/20 border-b last:border-0"
                    >
                      <td className="text-foreground px-4 py-3">
                        {creator?.displayName ?? data.creatorId}
                      </td>
                      <td className="text-foreground px-4 py-3 font-medium tabular-nums">
                        {formatKes(data.commissionKes)}
                      </td>
                      <td className="text-foreground px-4 py-3 tabular-nums">
                        {formatKes(data.discountKes)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/orders/${data.orderId}`}
                          className="text-primary hover:underline"
                        >
                          View order
                        </Link>
                      </td>
                      <td className="text-muted-foreground px-4 py-3 tabular-nums">
                        {formatDate(data.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        {nextCommissionsCursor ? (
          <div className="border-border flex justify-center border-t p-4">
            <Button asChild variant="outline">
              <Link
                href={`/admin/referrals?commissionsCursor=${nextCommissionsCursor}${linksCursor ? `&linksCursor=${linksCursor}` : ''}`}
              >
                Load more commissions
              </Link>
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
