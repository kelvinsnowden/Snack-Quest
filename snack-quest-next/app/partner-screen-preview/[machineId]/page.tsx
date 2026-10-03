import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { kioskScreenService } from '@/services/kioskScreenService';
import { kioskOwnerDesignService, OwnerDesignError } from '@/services/kioskOwnerDesignService';
import { KioskScopeError } from '@/services/kioskExperienceService';
import { KioskScreen } from '@/components/kiosk/KioskScreen';

export const metadata: Metadata = { title: 'Screen preview', robots: { index: false, follow: false } };

/**
 * An owner's own screen design proposal drawn on one of their machines
 * (§ OWNER SCREEN DESIGN). Lives outside the portal layout so it frames
 * like a real screen. Needs the owner's session, and the machine must be
 * theirs — anything else is a plain 404. Payments are off in preview.
 */
export default async function PartnerScreenPreviewPage({ params, searchParams }: { params: Promise<{ machineId: string }>; searchParams: Promise<{ idle?: string }> }) {
  const session = await requirePartnerSession();
  const { machineId } = await params;
  const search = await searchParams;
  let preview;
  try {
    preview = await kioskOwnerDesignService.previewProposal(session.businessId, session.partnerId, machineId);
  } catch (error) {
    if (error instanceof OwnerDesignError || error instanceof KioskScopeError) notFound();
    throw error;
  }
  const [items, catalogVersion, screen] = await Promise.all([
    machineAssortmentService.getSellableCatalog(session.businessId, machineId),
    machineAssortmentService.getCatalogVersion(session.businessId, machineId),
    kioskScreenService.resolveForMachine(session.businessId, machineId),
  ]);
  return <KioskScreen machineId={machineId} machineCode={preview.machine.machineCode} preview={{ experience: preview.resolved.config, catalog: { catalogVersion, items }, screen, startIdle: search.idle === '1' }} />;
}
