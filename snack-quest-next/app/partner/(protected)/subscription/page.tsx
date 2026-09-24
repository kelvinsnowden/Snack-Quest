import type { Metadata } from 'next';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { machineSubscriptionService } from '@/services/machineSubscriptionService';
import { partnerService } from '@/services/partnerService';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Subscription' };

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-success/10 text-success',
  paused: 'bg-warning/10 text-warning',
  cancelled: 'bg-border/50 text-muted-foreground',
  in_arrears: 'bg-danger/10 text-danger',
};

/** § SUBSCRIPTION — plan, amount, billing frequency, status, payment history, and which machine each subscription covers. */
export default async function PartnerSubscriptionPage() {
  const session = await requirePartnerSession();
  const [subscriptions, machines] = await Promise.all([
    machineSubscriptionService.listByPartner(session.businessId, session.partnerId),
    partnerService.listMachines(session.businessId, session.partnerId),
  ]);
  const machineCodeById = new Map(machines.map(({ id, data }) => [id, data.machineCode]));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">Subscription</h1>
      {subscriptions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No subscriptions on your machines yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {subscriptions.map(({ id, data }) => (
            <Card key={id}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{data.planName}</p>
                    <p className="text-xs text-muted-foreground">{machineCodeById.get(data.machineId) ?? data.machineId}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLE[data.status] ?? ''}`}>{data.status.replace('_', ' ')}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="font-semibold text-foreground">KES {data.amountKes.toLocaleString('en-KE')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Billing</p>
                    <p className="font-semibold capitalize text-foreground">{data.frequency}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Renews</p>
                    <p className="font-semibold text-foreground">{data.renewalDate.toDate().toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last payment</p>
                    <p className="font-semibold capitalize text-foreground">{data.lastPaymentStatus}</p>
                  </div>
                </div>
                {data.arrearsKes > 0 ? (
                  <p className="text-sm text-danger">KES {data.arrearsKes.toLocaleString('en-KE')} in arrears{data.graceUntil ? ` — grace until ${data.graceUntil.toDate().toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}` : ''}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
