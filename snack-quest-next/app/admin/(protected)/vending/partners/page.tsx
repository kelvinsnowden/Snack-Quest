import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaffSession } from '@/lib/auth/session';
import { partnerService } from '@/services/partnerService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Machine Owners' };

/**
 * The machine-owner ("partner") list (§ multi-machine partner
 * architecture, § OWNER WALLET, docs/MACHINE_COMMERCE.md). No partner
 * login exists yet — this is the staff-facing view onto the wallet,
 * settlements and withdrawal history the commerce/inventory backbone
 * now actually computes for each owner.
 */
export default async function AdminVendingPartnersPage() {
  const session = await requireStaffSession();
  const partners = await partnerService.listByBusiness(session.businessId);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Machine Owners</h1>
        <p className="text-sm text-muted-foreground">
          {partners.length} owner{partners.length === 1 ? '' : 's'} — wallet balances, settlements and withdrawals.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Owners</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {partners.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No machine owners recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Owner</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Available balance</th>
                    <th className="px-6 py-3 font-medium">Lifetime earned</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map(({ id, data }) => (
                    <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                      <td className="px-6 py-3 font-medium text-foreground">
                        <Link href={`/admin/vending/partners/${id}`} className="hover:underline">
                          {data.name}
                        </Link>
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant={data.status === 'active' ? 'success' : 'outline'}>{data.status}</Badge>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">KES {data.availableCashKes.toLocaleString('en-KE')}</td>
                      <td className="px-6 py-3 text-muted-foreground">KES {data.lifetimeEarnedKes.toLocaleString('en-KE')}</td>
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
