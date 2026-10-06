import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { requireAdminPage } from '@/lib/auth/requireAdminSection';
import { hasPermission } from '@/lib/auth/permissions';
import { kioskExperienceService } from '@/services/kioskExperienceService';
import { kioskOwnerDesignService } from '@/services/kioskOwnerDesignService';
import { partnerRepository } from '@/repositories/partnerRepository';
import { locationRepository } from '@/repositories/locationRepository';
import { machineRepository } from '@/repositories/machineRepository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KioskLayerPicker } from '@/components/admin/vending/KioskLayerPicker';
import { OwnerProposalReview } from '@/components/admin/vending/OwnerProposalReview';
import { KIOSK_LAYER_SCOPE_LABEL, OWNER_EDITABLE_KIOSK_KEYS, type KioskExperiencePatch } from '@/types';

const PART_LABEL: Record<(typeof OWNER_EDITABLE_KIOSK_KEYS)[number], string> = {
  theme: 'colours and style',
  browseSections: 'menu layout',
  badges: 'badges',
  productCard: 'product tiles',
  copy: 'wording',
  language: 'languages',
  translations: 'translations',
};

function changedParts(patch: KioskExperiencePatch): string {
  const parts = OWNER_EDITABLE_KIOSK_KEYS.filter((key) => patch[key] !== undefined).map((key) => PART_LABEL[key]);
  return parts.length > 0 ? `Changes ${parts.join(', ')}` : 'Back to the Snack Quest design';
}

export const metadata: Metadata = { title: 'Screen design' };

/**
 * The customer screen's designs (§ KIOSK EXPERIENCE BUILDER): the fleet-wide
 * design and every owner, location or machine that has its own. A machine
 * shows the most specific published design that covers it.
 */
export default async function KioskDesignPage() {
  const session = await requireAdminPage('vending', 'kiosk.view');
  const [layers, partners, locations, machines, proposals] = await Promise.all([
    kioskExperienceService.listLayers(session.businessId),
    partnerRepository.listByBusiness(session.businessId),
    locationRepository.listByBusiness(session.businessId),
    machineRepository.listAllForBusiness(session.businessId),
    kioskOwnerDesignService.listSubmitted(session.businessId),
  ]);
  const canPublish = hasPermission(session, 'kiosk.publish');
  const name = (scope: string, scopeId: string) =>
    scope === 'global'
      ? 'Every machine'
      : scope === 'owner'
        ? (partners.find((p) => p.id === scopeId)?.data.name ?? scopeId)
        : scope === 'location'
          ? (locations.find((l) => l.id === scopeId)?.data.name ?? scopeId)
          : (machines.find((m) => m.id === scopeId)?.data.machineCode ?? scopeId);
  const hasGlobal = layers.some(({ data }) => data.scope === 'global');

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Screen design</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Colours, layout, badges and wording on the customer screen. Set a design for every machine, then change it for one owner’s machines, one location, or one machine. The most specific
          published design wins. Artwork (banner and idle images) is under{' '}
          <Link href="/admin/vending/kiosk-screen" className="text-primary hover:underline">
            Machine Screen
          </Link>
          .
        </p>
      </div>

      {proposals.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Owners’ designs to review</CardTitle>
            <p className="text-sm text-muted-foreground">Owners can propose colours, menu, badges and wording for their own machines. Nothing changes on a machine until it’s accepted here.</p>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {proposals.map((proposal) => {
                const ownerName = partners.find((p) => p.id === proposal.partnerId)?.data.name ?? proposal.partnerId;
                const previewOn = machines.find(({ data }) => data.ownerPartnerId === proposal.partnerId && data.status !== 'decommissioned');
                return (
                  <li key={proposal.partnerId} className="flex flex-col gap-3 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <span className="block text-sm font-medium">{ownerName}</span>
                        <span className="text-caption text-muted-foreground">{changedParts(proposal.patch)}</span>
                      </span>
                      {previewOn ? (
                        <Link href={`/kiosk-preview/${previewOn.id}?proposal=${encodeURIComponent(proposal.partnerId)}`} target="_blank" className="text-sm text-primary hover:underline">
                          Preview on {previewOn.data.machineCode}
                        </Link>
                      ) : null}
                    </div>
                    {canPublish ? <OwnerProposalReview partnerId={proposal.partnerId} ownerName={ownerName} updatedAtMillis={proposal.updatedAt.toMillis()} /> : null}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Designs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {!hasGlobal ? (
              <li>
                <Link href="/admin/vending/kiosk-design/global/all" className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/10">
                  <span>
                    <span className="block text-sm font-medium">Every machine</span>
                    <span className="text-caption text-muted-foreground">Built-in design — nothing published yet</span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ) : null}
            {layers.map(({ id, data }) => (
              <li key={id}>
                <Link href={`/admin/vending/kiosk-design/${data.scope}/${encodeURIComponent(data.scopeId)}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/10">
                  <span>
                    <span className="block text-sm font-medium">{name(data.scope, data.scopeId)}</span>
                    <span className="text-caption text-muted-foreground">
                      {KIOSK_LAYER_SCOPE_LABEL[data.scope]} · {data.publishedVersionId ? `version ${data.publishedVersionNumber} live` : 'draft only, not live'}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {hasPermission(session, 'kiosk.design') ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Design for one owner, location or machine</CardTitle>
          </CardHeader>
          <CardContent>
            <KioskLayerPicker
              owners={partners.map(({ id, data }) => ({ id, name: data.name })).sort((a, b) => a.name.localeCompare(b.name))}
              locations={locations.map(({ id, data }) => ({ id, name: data.name })).sort((a, b) => a.name.localeCompare(b.name))}
              machines={machines.filter(({ data }) => data.status !== 'decommissioned').map(({ id, data }) => ({ id, name: data.machineCode })).sort((a, b) => a.name.localeCompare(b.name))}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
