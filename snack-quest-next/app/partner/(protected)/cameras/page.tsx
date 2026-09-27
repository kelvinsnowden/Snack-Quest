import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Camera, CircleDot } from 'lucide-react';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { ownerPortalService } from '@/services/ownerPortalService';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Cameras' };

/**
 * § CAMERAS (fleet-wide index). Each machine's live snapshot already
 * lives at its own `/partner/machines/[machineId]/camera` route — this
 * page is the "all your cameras" jumping-off point the sidebar's own
 * "Cameras" item needs, rather than duplicating the live-feed view.
 */
export default async function PartnerCamerasPage() {
  const session = await requirePartnerSession();
  const dashboard = await ownerPortalService.getDashboard(session.businessId, session.partnerId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cameras</h1>
        <p className="text-sm text-muted-foreground">Open a machine&apos;s camera for its live feed and recent snapshots.</p>
      </div>

      {dashboard.machines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No machines yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {dashboard.machines.map((machine) => (
            <Link key={machine.machineId} href={`/partner/machines/${machine.machineId}/camera`} className="block">
              <Card className="transition-colors hover:bg-border/10">
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-border/30 text-muted-foreground">
                    <Camera className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{machine.machineCode}</p>
                    <span className={cn('flex items-center gap-1.5 text-xs capitalize', machine.connectivity === 'online' ? 'text-success' : 'text-muted-foreground')}>
                      <CircleDot className="size-3" aria-hidden="true" />
                      {machine.connectivity}
                    </span>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
