import type { Metadata } from 'next';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { ownerPaymentAccountService, type MachinePaymentRoute } from '@/services/ownerPaymentAccountService';
import { partnerService } from '@/services/partnerService';
import { MpesaTillPanel } from '@/components/partner/MpesaTillPanel';
import { tillLabel } from '@/lib/vending/tillLabel';
import { MachineTillSelect } from '@/components/partner/MachineTillSelect';
import { isEncryptionConfigured } from '@/lib/secrets/secretCipher';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'M-Pesa tills' };

const ROUTE_TEXT: Record<MachinePaymentRoute, { badge: string; variant: 'success' | 'outline' | 'warning' | 'danger'; note: string }> = {
  owner_till: { badge: 'Your till', variant: 'success', note: 'Customers pay straight into your till.' },
  no_till: { badge: 'Snack Quest', variant: 'outline', note: 'Choose one of your tills to be paid directly.' },
  till_not_working: { badge: 'Snack Quest', variant: 'danger', note: 'Its till isn’t working, so sales go to Snack Quest until it’s fixed.' },
  not_invoice_billing: { badge: 'Snack Quest', variant: 'warning', note: 'Snack Quest switches this machine to direct payment. Ask us and we’ll turn it on.' },
};

/**
 * § OWNER TILL — the owner connects their own M-Pesa tills or paybills
 * and chooses, machine by machine, which one its sales are paid into.
 */
export default async function PartnerPaymentsPage() {
  const session = await requirePartnerSession();
  const [tills, machines] = await Promise.all([
    ownerPaymentAccountService.list(session.businessId, session.partnerId),
    partnerService.listMachines(session.businessId, session.partnerId),
  ]);
  const routes = await ownerPaymentAccountService.routesFor(session.businessId, session.partnerId, machines.map(({ id }) => id));
  const tillOptions = tills.map((till) => ({ id: till.id, label: tillLabel(till) }));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Get paid into your own M-Pesa</h1>
        <p className="text-sm text-muted-foreground">Connect your tills or paybills, then choose which one each machine’s sales are paid into. You pay Snack Quest for snacks and the management fee on your invoices.</p>
      </div>

      <MpesaTillPanel tills={tills} machines={machines.map(({ id, data }) => ({ id, code: data.machineCode }))} keysEncrypted={isEncryptionConfigured()} />

      {machines.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="machine-payments">
          <h2 id="machine-payments" className="text-lg font-semibold text-foreground">
            Where each machine’s sales go
          </h2>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {machines.map(({ id, data }) => {
                const { route, accountId } = routes.get(id) ?? { route: 'no_till' as const, accountId: null };
                const text = ROUTE_TEXT[route];
                return (
                  <div key={id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium text-foreground">
                        {data.machineCode}
                        <Badge variant={text.variant}>{text.badge}</Badge>
                      </p>
                      <p className="text-xs text-muted-foreground">{text.note}</p>
                    </div>
                    {tills.length > 0 ? <MachineTillSelect machineId={id} machineCode={data.machineCode} value={accountId} tills={tillOptions} /> : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
