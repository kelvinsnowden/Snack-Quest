import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireAdminPage } from '@/lib/auth/requireAdminSection';
import { hasPermission } from '@/lib/auth/permissions';
import { listAdapterRegistrations, type AdapterRegistration } from '@/lib/vending/adapterRegistry';
import { partnerService } from '@/services/partnerService';
import { locationService } from '@/services/locationService';
import { Card, CardContent } from '@/components/ui/card';
import { MachineRegistrationWizard } from '@/components/admin/vending/MachineRegistrationWizard';

export const metadata: Metadata = { title: 'Register a machine' };

/** What each connection can honestly do today, in words an operator can act on. Registering never makes a machine sell; these only set expectations. */
function manufacturerNote(entry: AdapterRegistration): string {
  if (entry.environment === 'sandbox_only') return entry.maturity === 'reference' ? 'A template for building a manufacturer connection. Testing only — it can never take real payments.' : 'Simulated machine for testing. It can never take real payments.';
  if (entry.maturity === 'stub') return 'Not connected yet — this manufacturer’s machines can be registered, but can’t vend until the connection is built and tested with their hardware.';
  return 'The manufacturer connects to Snack Quest. The machine still has to pass certification before it can take real payments.';
}

export default async function RegisterMachinePage() {
  const session = await requireAdminPage('vending', 'machines.create');
  const canSetOwner = hasPermission(session, 'owners.manage');
  const canSetLocation = hasPermission(session, 'machines.relocate');
  const [owners, locations] = await Promise.all([
    canSetOwner ? partnerService.listByBusiness(session.businessId) : Promise.resolve([]),
    canSetLocation ? locationService.listByBusiness(session.businessId) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <Link href="/admin/vending" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Vending Machines
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Register a machine</h1>
      </div>
      <Card className="max-w-3xl">
        <CardContent className="p-6">
          <MachineRegistrationWizard
            manufacturers={listAdapterRegistrations().map((entry) => ({ key: entry.key, label: entry.label, note: manufacturerNote(entry) }))}
            owners={owners.filter(({ data }) => data.status === 'active').map(({ id, data }) => ({ id, name: data.name })).sort((a, b) => a.name.localeCompare(b.name))}
            locations={locations.map(({ id, data }) => ({ id, name: data.name })).sort((a, b) => a.name.localeCompare(b.name))}
            canSetOwner={canSetOwner}
            canSetLocation={canSetLocation}
          />
        </CardContent>
      </Card>
    </div>
  );
}
