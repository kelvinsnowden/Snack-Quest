import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireAdminPage } from '@/lib/auth/requireAdminSection';
import { hasPermission } from '@/lib/auth/permissions';
import { kioskExperienceService, KioskScopeError } from '@/services/kioskExperienceService';
import { machineRepository } from '@/repositories/machineRepository';
import { partnerRepository } from '@/repositories/partnerRepository';
import { locationRepository } from '@/repositories/locationRepository';
import { KioskDesigner } from '@/components/admin/vending/KioskDesigner';
import { KIOSK_LAYER_SCOPE_LABEL, KIOSK_LAYER_SCOPES, type KioskLayerScope, type Machine } from '@/types';

export const metadata: Metadata = { title: 'Screen designer' };

const PREVIEW_LIMIT = 50;

/** The builder for one design layer (§ KIOSK EXPERIENCE BUILDER). Read with `kiosk.view`; edit with `kiosk.design`; publish with `kiosk.publish`. */
export default async function KioskDesignerPage({ params }: { params: Promise<{ scope: string; scopeId: string }> }) {
  const session = await requireAdminPage('vending', 'kiosk.view');
  const { scope: rawScope, scopeId: rawScopeId } = await params;
  const scopeId = decodeURIComponent(rawScopeId);
  if (!(KIOSK_LAYER_SCOPES as readonly string[]).includes(rawScope)) notFound();
  const scope = rawScope as KioskLayerScope;

  let state;
  try {
    state = await kioskExperienceService.editorState(session.businessId, scope, scopeId);
  } catch (error) {
    if (error instanceof KioskScopeError) notFound();
    throw error;
  }

  let title = 'Every machine';
  let machines: { id: string; data: Machine }[] = [];
  if (scope === 'global') {
    machines = (await machineRepository.listAllForBusiness(session.businessId)).slice(0, PREVIEW_LIMIT);
  } else if (scope === 'owner') {
    title = (await partnerRepository.findById(session.businessId, scopeId))?.name ?? scopeId;
    machines = await machineRepository.listByPartner(session.businessId, scopeId);
  } else if (scope === 'location') {
    title = (await locationRepository.findById(session.businessId, scopeId))?.name ?? scopeId;
    machines = await machineRepository.listByLocation(session.businessId, scopeId);
  } else {
    const machine = await machineRepository.findById(session.businessId, scopeId);
    title = machine?.machineCode ?? scopeId;
    if (machine) machines = [{ id: scopeId, data: machine }];
  }
  const previewMachines = machines
    .filter(({ data }) => data.status !== 'decommissioned')
    .map(({ id, data }) => ({ id, code: data.machineCode, widthPx: data.display?.widthPx ?? 1080, heightPx: data.display?.heightPx ?? 1920, profileSet: Boolean(data.display) }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <Link href="/admin/vending/kiosk-design" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Screen design
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {KIOSK_LAYER_SCOPE_LABEL[scope]}. {scope === 'global' ? 'Starts from the built-in design.' : 'Starts from the design above it; anything you set here wins for these machines.'}
        </p>
      </div>
      <KioskDesigner
        scope={scope}
        scopeId={scopeId}
        initialDraft={state.draft}
        inherited={state.inherited}
        versions={state.versions.map(({ data }) => ({
          versionNumber: data.versionNumber,
          note: data.note,
          rolledBackFrom: data.rolledBackFrom,
          publishedBy: data.publishedBy,
          publishedAt: data.publishedAt ? (data.publishedAt as unknown as { toDate(): Date }).toDate().toISOString() : null,
        }))}
        liveVersionNumber={state.live?.versionNumber ?? null}
        previewMachines={previewMachines}
        canDesign={hasPermission(session, 'kiosk.design')}
        canPublish={hasPermission(session, 'kiosk.publish')}
      />
    </div>
  );
}
