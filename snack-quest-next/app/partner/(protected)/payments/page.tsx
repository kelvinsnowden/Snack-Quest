import type { Metadata } from 'next';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { ownerPaymentAccountService, type MachinePaymentRoute } from '@/services/ownerPaymentAccountService';
import { partnerService } from '@/services/partnerService';
import { MpesaTillPanel } from '@/components/partner/MpesaTillPanel';
import { isEncryptionConfigured } from '@/lib/secrets/secretCipher';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'M-Pesa till' };

const ROUTE_TEXT: Record<MachinePaymentRoute, { badge: string; variant: 'success' | 'outline' | 'warning'; note: string }> = {
  owner_till: { badge: 'Your till', variant: 'success', note: 'Customers pay straight into your till.' },
  not_connected: { badge: 'Snack Quest', variant: 'outline', note: 'Goes to Snack Quest until your till above is connected.' },
  not_invoice_billing: { badge: 'Snack Quest', variant: 'warning', note: 'Snack Quest switches this machine to direct payment. Ask us and we’ll turn it on.' },
};

/**
 * § OWNER TILL — the owner connects their own M-Pesa till or paybill, so
 * their machines' sales are paid straight into it, and sees where each
 * machine's sales go right now.
 */
export default async function PartnerPaymentsPage() {
  const session = await requirePartnerSession();
  const [account, machines] = await Promise.all([
    ownerPaymentAccountService.view(session.businessId, session.partnerId),
    partnerService.listMachines(session.businessId, session.partnerId),
  ]);
  const routes = await Promise.all(machines.map(({ id }) => ownerPaymentAccountService.routeFor(session.businessId, id, session.partnerId)));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Get paid into your own M-Pesa</h1>
        <p className="text-sm text-muted-foreground">Connect your till or paybill once, and your machines’ sales are paid straight into it. You pay Snack Quest for snacks and the management fee on your invoices.</p>
      </div>

      <MpesaTillPanel account={account} keysEncrypted={isEncryptionConfigured()} />

      {machines.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="machine-payments">
          <h2 id="machine-payments" className="text-lg font-semibold text-foreground">
            Where each machine’s sales go
          </h2>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {machines.map(({ id, data }, index) => {
                const route = ROUTE_TEXT[routes[index]];
                return (
                  <div key={id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{data.machineCode}</p>
                      <p className="text-xs text-muted-foreground">{route.note}</p>
                    </div>
                    <Badge variant={route.variant} className="shrink-0">
                      {route.badge}
                    </Badge>
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
