import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { machineService } from '@/services/machineService';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { kioskScreenService } from '@/services/kioskScreenService';
import { serializeKioskScreenImage } from '@/lib/vending/serialize';
import { KioskScreenImagesManager } from '@/components/admin/KioskScreenImagesManager';
import { MachineScreenProducts, type ScreenProductRow } from '@/components/admin/MachineScreenProducts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DisplayProfileForm } from '@/components/admin/vending/DisplayProfileForm';
import { hasPermission } from '@/lib/auth/permissions';

export const metadata: Metadata = { title: 'Customer screen' };

/**
 * Everything a customer sees on one machine's touchscreen: how each
 * product looks (photo, name, short description, category, position,
 * badge) and this machine's own banner and idle-screen images, which
 * replace the fleet-wide ones while it has any.
 */
export default async function MachineCustomerScreenPage({ params }: { params: Promise<{ machineId: string }> }) {
  const session = await requireStaffSession();
  const { machineId } = await params;
  const machine = await machineService.findById(session.businessId, machineId);
  if (!machine) {
    notFound();
  }

  const [presentation, images] = await Promise.all([
    machineAssortmentService.listScreenPresentation(session.businessId, machineId),
    kioskScreenService.list(session.businessId),
  ]);

  const rows: ScreenProductRow[] = presentation.map(({ assortment, product }) => ({
    productId: assortment.productId,
    productCatalogue: assortment.productCatalogue,
    slotCode: assortment.slotCode,
    visible: assortment.visible,
    displayOrder: assortment.displayOrder,
    category: assortment.category,
    promotionalState: assortment.promotionalState,
    customerFacingName: assortment.customerFacingName,
    customerFacingDescription: assortment.customerFacingDescription,
    customerFacingImageUrl: assortment.customerFacingImageUrl,
    product,
  }));
  const ownImages = images.filter((row) => row.data.machineId === machineId).map(({ id, data }) => serializeKioskScreenImage(id, data));
  const fleetImages = images.filter((row) => row.data.machineId === null).map(({ id, data }) => serializeKioskScreenImage(id, data));

  return (
    <div className="flex flex-col gap-8 p-6">
      <div>
        <Link href={`/admin/vending/${machineId}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to {machine.machineCode}
        </Link>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-foreground">Customer screen &mdash; {machine.machineCode}</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Changes reach the machine within a minute. A snack&apos;s own photo and description are edited once in{' '}
            <Link href="/admin/snack-items" className="font-medium text-foreground underline underline-offset-4">
              Snacks
            </Link>{' '}
            and used on every machine; anything set here applies to {machine.machineCode} only.
          </p>
        </div>
        <Link
          href={`/admin/vending/${machineId}/catalog-preview`}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-border/30"
        >
          Preview what&apos;s for sale
          <ExternalLink className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
        </CardHeader>
        <CardContent>
          <MachineScreenProducts machineId={machineId} rows={rows} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Banner and idle screen for this machine</CardTitle>
        </CardHeader>
        <CardContent>
          <KioskScreenImagesManager machineId={machineId} images={ownImages} inherited={fleetImages} />
        </CardContent>
      </Card>

      {hasPermission(session, 'kiosk.view') ? (
        <Card>
          <CardHeader>
            <CardTitle>Screen size and design</CardTitle>
            <p className="text-sm text-muted-foreground">
              {machine.display ? `${machine.display.widthPx}×${machine.display.heightPx}${machine.display.diagonalInches ? `, ${machine.display.diagonalInches}"` : ''}, ${machine.display.orientation}.` : 'Screen size not recorded — previews assume 1080×1920 portrait.'}{' '}
              <Link href={`/admin/vending/kiosk-design/machine/${machineId}`} className="text-primary hover:underline">
                Design this machine’s screen
              </Link>
            </p>
          </CardHeader>
          {hasPermission(session, 'kiosk.design') ? (
            <CardContent>
              <DisplayProfileForm machineId={machineId} current={machine.display ?? null} />
            </CardContent>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
