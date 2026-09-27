import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, MapPin } from 'lucide-react';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { ownerPortalService } from '@/services/ownerPortalService';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Locations' };

/**
 * § LOCATIONS (fleet-wide). `getDashboard`'s machine cards only carry
 * `locationName`, not the full `Location` record — grouping by that
 * name is the honest version of this page for now rather than a
 * literal map, which needs geocoding this portal doesn't have wired up
 * yet. Each machine still links straight to its own detail page, which
 * does have the fuller location record (city/area).
 */
export default async function PartnerLocationsPage() {
  const session = await requirePartnerSession();
  const dashboard = await ownerPortalService.getDashboard(session.businessId, session.partnerId);

  const byLocation = new Map<string, typeof dashboard.machines>();
  for (const machine of dashboard.machines) {
    const key = machine.locationName ?? 'Unassigned';
    byLocation.set(key, [...(byLocation.get(key) ?? []), machine]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Locations</h1>
        <p className="text-sm text-muted-foreground">
          {byLocation.size} location{byLocation.size === 1 ? '' : 's'} across your fleet.
        </p>
      </div>

      {byLocation.size === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No locations yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {[...byLocation.entries()].map(([name, machines]) => (
            <Card key={name}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <MapPin className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-semibold text-foreground">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      {machines.length} machine{machines.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  {machines.map((machine) => (
                    <Link
                      key={machine.machineId}
                      href={`/partner/machines/${machine.machineId}`}
                      className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm text-foreground transition-colors hover:bg-border/20"
                    >
                      {machine.machineCode}
                      <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
