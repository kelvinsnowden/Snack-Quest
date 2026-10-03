import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { machineRepository } from '@/repositories/machineRepository';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { kioskScreenService } from '@/services/kioskScreenService';
import { kioskExperienceService, KioskScopeError } from '@/services/kioskExperienceService';
import { kioskOwnerDesignService, OwnerDesignError } from '@/services/kioskOwnerDesignService';
import { KIOSK_LAYER_SCOPES, type KioskLayerScope } from '@/types';
import { KioskScreen } from '@/components/kiosk/KioskScreen';

export const metadata: Metadata = { title: 'Screen preview', robots: { index: false, follow: false } };

/**
 * The real customer-screen renderer, drawn for staff with a layer's saved
 * draft in place (§ KIOSK EXPERIENCE BUILDER — preview). Framed by the
 * builder at the machine's own screen size. Needs a staff session with
 * `kiosk.view`; `?proposal=<partnerId>` draws that owner's screen design
 * proposal instead (§ OWNER SCREEN DESIGN), so a reviewer sees it before
 * accepting. Payments are switched off in preview mode, and nothing
 * here uses the machine's device credential.
 */
export default async function KioskPreviewPage({ params, searchParams }: { params: Promise<{ machineId: string }>; searchParams: Promise<{ scope?: string; scopeId?: string; idle?: string; proposal?: string }> }) {
  const session = await requireStaffSession();
  if (!hasPermission(session, 'kiosk.view')) notFound();
  const { machineId } = await params;
  const search = await searchParams;
  const machine = await machineRepository.findById(session.businessId, machineId);
  if (!machine) notFound();
  const draftOf = search.scope && search.scopeId && (KIOSK_LAYER_SCOPES as readonly string[]).includes(search.scope) ? { scope: search.scope as KioskLayerScope, scopeId: search.scopeId } : null;

  let resolved;
  try {
    resolved = search.proposal
      ? (await kioskOwnerDesignService.previewProposal(session.businessId, search.proposal, machineId)).resolved
      : await kioskExperienceService.previewForMachine(session.businessId, machineId, draftOf);
  } catch (error) {
    if (error instanceof KioskScopeError || error instanceof OwnerDesignError) notFound();
    throw error;
  }
  const [items, catalogVersion, screen] = await Promise.all([
    machineAssortmentService.getSellableCatalog(session.businessId, machineId),
    machineAssortmentService.getCatalogVersion(session.businessId, machineId),
    kioskScreenService.resolveForMachine(session.businessId, machineId),
  ]);

  return <KioskScreen machineId={machineId} machineCode={machine.machineCode} preview={{ experience: resolved.config, catalog: { catalogVersion, items }, screen, startIdle: search.idle === '1' }} />;
}
