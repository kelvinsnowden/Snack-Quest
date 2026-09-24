import Link from 'next/link';
import type { Metadata } from 'next';
import { CircleDot, MapPin, Package } from 'lucide-react';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { ownerPortalService } from '@/services/ownerPortalService';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Dashboard' };

const CONNECTIVITY_DOT: Record<string, string> = {
  online: 'text-success',
  stale: 'text-warning',
  offline: 'text-danger',
  unknown: 'text-muted-foreground',
};

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

/** § OWNER DASHBOARD — active machines, total revenue, available/pending profit, withdrawn, subscription status, and per-machine cards. */
export default async function PartnerDashboardPage() {
  const session = await requirePartnerSession();
  const dashboard = await ownerPortalService.getDashboard(session.businessId, session.partnerId);

  const activeMachines = dashboard.machines.filter((m) => m.status === 'active').length;
  const totalRevenueKes = dashboard.machines.reduce((sum, m) => sum + m.revenueKes, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Here&apos;s how your machines are doing.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Active machines" value={`${activeMachines} / ${dashboard.machines.length}`} />
        <StatTile label="Revenue (30d)" value={`KES ${totalRevenueKes.toLocaleString('en-KE')}`} />
        <StatTile label="Available" value={`KES ${dashboard.wallet.availableKes.toLocaleString('en-KE')}`} hint="Pooled across all machines" />
        <StatTile label="Pending" value={`KES ${dashboard.wallet.pendingKes.toLocaleString('en-KE')}`} hint="Withdrawal requests in flight" />
        <StatTile label="Withdrawn" value={`KES ${dashboard.wallet.withdrawnKes.toLocaleString('en-KE')}`} />
        <StatTile label="Lifetime earned" value={`KES ${dashboard.wallet.earnedKes.toLocaleString('en-KE')}`} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Your machines</h2>
        {dashboard.machines.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No machines yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {dashboard.machines.map((machine) => (
              <Link key={machine.machineId} href={`/partner/machines/${machine.machineId}`} className="block">
                <Card className="transition-colors hover:bg-border/10">
                  <CardContent className="flex flex-col gap-3 p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">{machine.machineCode}</span>
                      <span className={`flex items-center gap-1.5 text-xs font-medium capitalize ${CONNECTIVITY_DOT[machine.connectivity]}`}>
                        <CircleDot className="size-3" aria-hidden="true" />
                        {machine.connectivity}
                      </span>
                    </div>
                    {machine.locationName ? (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="size-3.5" aria-hidden="true" />
                        {machine.locationName}
                      </span>
                    ) : null}
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Revenue (30d)</p>
                        <p className="font-semibold text-foreground">KES {machine.revenueKes.toLocaleString('en-KE')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Units sold</p>
                        <p className="font-semibold text-foreground">{machine.unitsSold}</p>
                      </div>
                      <div>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground"><Package className="size-3" aria-hidden="true" />Stock health</p>
                        <p className="font-semibold text-foreground">{machine.stockHealth.sellableCount}/{machine.stockHealth.assortmentCount}</p>
                      </div>
                    </div>
                    {machine.subscriptionStatus ? (
                      <span className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${machine.subscriptionStatus === 'active' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                        Subscription: {machine.subscriptionStatus}
                      </span>
                    ) : null}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
