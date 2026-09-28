import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, MonitorSmartphone } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { kioskScreenService } from '@/services/kioskScreenService';
import { machineRepository } from '@/repositories/machineRepository';
import { serializeKioskScreenImage } from '@/lib/vending/serialize';
import { KioskScreenImagesManager } from '@/components/admin/KioskScreenImagesManager';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Machine Screen' };

/**
 * The fleet-wide artwork for the customer machine screen — the menu
 * banner and the idle screen every machine shows unless it has images
 * of its own. Per-machine images and each product's photo and
 * description live on the machine's own "Customer screen" page, linked
 * below.
 */
export default async function KioskScreenPage() {
  const session = await requireStaffSession();
  const [images, machines] = await Promise.all([
    kioskScreenService.list(session.businessId),
    machineRepository.listAllForBusiness(session.businessId),
  ]);
  const fleetImages = images.filter((row) => row.data.machineId === null).map(({ id, data }) => serializeKioskScreenImage(id, data));
  const ownCount = new Map<string, number>();
  for (const row of images) {
    if (row.data.machineId) ownCount.set(row.data.machineId, (ownCount.get(row.data.machineId) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-8 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Machine screen</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Choose what customers see on every machine&apos;s touchscreen. Machines check for changes every 20 seconds, so a new banner is live within a minute.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Every machine</CardTitle>
        </CardHeader>
        <CardContent>
          <KioskScreenImagesManager machineId={null} images={fleetImages} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>One machine at a time</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-prose text-sm text-muted-foreground">
            Give a single machine its own banner or idle screen — a campus promotion, a new location — and style how each of its products looks: photo, name and short description.
          </p>
          {machines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No machines yet.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {machines.map(({ id, data }) => (
                <li key={id}>
                  <Link
                    href={`/admin/vending/${id}/screen`}
                    className="flex min-h-14 items-center gap-3 rounded-md border border-border px-4 py-3 text-sm hover:bg-border/30 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                  >
                    <MonitorSmartphone className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium text-foreground">{data.machineCode}</span>
                      <span className="truncate text-caption text-muted-foreground">
                        {data.venueName ?? 'No location'} · {ownCount.get(id) ? `${ownCount.get(id)} own image${ownCount.get(id) === 1 ? '' : 's'}` : 'fleet images'}
                      </span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
