'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Boxes, CircleDot, MapPin, Search } from 'lucide-react';
import type { OwnerMachineCard } from '@/services/ownerPortalService';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { StockLevelBar } from '@/components/partner/StockLevelBar';

const CONNECTIVITY_DOT: Record<string, string> = {
  online: 'text-success',
  stale: 'text-warning',
  offline: 'text-danger',
  unknown: 'text-muted-foreground',
};

const STATUS_BADGE: Record<OwnerMachineCard['status'], { label: string; variant: 'success' | 'warning' | 'danger' | 'secondary' | 'outline' }> = {
  provisioning: { label: 'Provisioning', variant: 'secondary' },
  installing: { label: 'Installing', variant: 'secondary' },
  testing: { label: 'Testing', variant: 'secondary' },
  active: { label: 'Active', variant: 'success' },
  maintenance: { label: 'Maintenance', variant: 'warning' },
  offline: { label: 'Offline', variant: 'danger' },
  decommissioned: { label: 'Decommissioned', variant: 'outline' },
};

/**
 * Client-side search only — this partner's own fleet is small enough
 * (a handful to a few dozen machines) that a server round trip for
 * "type to filter" would be slower than just filtering the list
 * `getDashboard` already fetched once.
 */
export function MachineListFilter({ machines }: { machines: OwnerMachineCard[] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return machines;
    return machines.filter((m) => m.machineCode.toLowerCase().includes(q) || (m.locationName ?? '').toLowerCase().includes(q));
  }, [machines, query]);

  if (machines.length === 0) {
    return <EmptyState icon={Boxes} title="No machines yet" description="Machines assigned to you will appear here once they're set up." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by machine code or location" className="pl-9" aria-label="Search machines" />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No machines match &quot;{query}&quot;.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((machine) => {
            const stockPct = machine.stockHealth.assortmentCount > 0 ? (machine.stockHealth.sellableCount / machine.stockHealth.assortmentCount) * 100 : 100;
            const statusBadge = STATUS_BADGE[machine.status];
            return (
              <Link key={machine.machineId} href={`/partner/machines/${machine.machineId}`} className="block">
                <Card className="h-full transition-colors hover:bg-border/10">
                  <CardContent className="flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-foreground">{machine.machineCode}</span>
                      <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      {machine.locationName ? (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="size-3.5" aria-hidden="true" />
                          {machine.locationName}
                        </span>
                      ) : (
                        <span>No location assigned</span>
                      )}
                      <span className={`flex items-center gap-1.5 font-medium capitalize ${CONNECTIVITY_DOT[machine.connectivity]}`}>
                        <CircleDot className="size-3" aria-hidden="true" />
                        {machine.connectivity}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Revenue (30d)</p>
                        <p className="font-semibold text-foreground">KES {machine.revenueKes.toLocaleString('en-KE')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Units sold</p>
                        <p className="font-semibold text-foreground">{machine.unitsSold}</p>
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Stock level</span>
                        <span>{Math.round(stockPct)}%</span>
                      </div>
                      <StockLevelBar percent={stockPct} />
                    </div>
                    {machine.subscriptionStatus === 'in_arrears' ? <Badge variant="danger">Subscription in arrears</Badge> : null}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
