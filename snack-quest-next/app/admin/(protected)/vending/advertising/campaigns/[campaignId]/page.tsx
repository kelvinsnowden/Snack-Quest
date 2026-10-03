import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireAdminPage } from '@/lib/auth/requireAdminSection';
import { hasPermission } from '@/lib/auth/permissions';
import { advertisingService } from '@/services/advertisingService';
import { machineRepository } from '@/repositories/machineRepository';
import { locationRepository } from '@/repositories/locationRepository';
import { partnerRepository } from '@/repositories/partnerRepository';
import { nairobiClock } from '@/lib/ads/playlist';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CampaignForm, CampaignStatusActions } from '@/components/admin/vending/AdvertisingControls';

export const metadata: Metadata = { title: 'Campaign' };

/** One campaign: its settings (editable while a draft or paused) and its status controls. */
export default async function CampaignPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const session = await requireAdminPage('vending', 'advertising.view');
  const { campaignId } = await params;
  const campaign = await advertisingService.getCampaign(session.businessId, campaignId);
  if (!campaign) notFound();
  const canEdit = hasPermission(session, 'advertising.manage') && (campaign.status === 'draft' || campaign.status === 'paused');
  const [advertisers, creatives, machines, locations, owners] = await Promise.all([
    advertisingService.listAdvertisers(session.businessId),
    advertisingService.listCreatives(session.businessId),
    machineRepository.listAllForBusiness(session.businessId),
    locationRepository.listByBusiness(session.businessId),
    partnerRepository.listByBusiness(session.businessId),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/vending/advertising" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Advertising
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">
            {campaign.status}
            {campaign.status === 'active' ? ' — pause it to make changes.' : ''}
          </p>
        </div>
        {hasPermission(session, 'advertising.publish') ? <CampaignStatusActions campaignId={campaignId} status={campaign.status} /> : null}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{canEdit ? 'Edit campaign' : 'Settings'}</CardTitle>
        </CardHeader>
        <CardContent>
          {canEdit ? (
            <CampaignForm
              campaignId={campaignId}
              initial={{
                advertiserId: campaign.advertiserId,
                name: campaign.name,
                creativeIds: campaign.creativeIds,
                schedule: campaign.schedule,
                targeting: campaign.targeting,
                weight: campaign.weight,
                frequencyCapPerHour: campaign.frequencyCapPerHour,
                billingModel: campaign.billingModel,
                priceKes: campaign.priceKes,
              }}
              advertisers={advertisers.map(({ id, data }) => ({ id, name: data.name, kind: data.kind }))}
              creatives={creatives.map(({ id, data }) => ({ id, name: data.name, advertiserId: data.advertiserId, status: data.status }))}
              machines={machines.map(({ id, data }) => ({ id, name: data.machineCode }))}
              locations={locations.map(({ id, data }) => ({ id, name: data.name }))}
              owners={owners.map(({ id, data }) => ({ id, name: data.name }))}
              today={nairobiClock(new Date()).date}
            />
          ) : (
            <dl className="grid max-w-xl grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Runs</dt>
              <dd>
                {campaign.schedule.startDate} → {campaign.schedule.endDate ?? 'until ended'}
              </dd>
              <dt className="text-muted-foreground">Where</dt>
              <dd>{campaign.targeting.allMachines ? 'Every machine' : `${campaign.targeting.machineIds.length} machines, ${campaign.targeting.locationIds.length} locations, ${campaign.targeting.ownerPartnerIds.length} owners`}</dd>
              <dt className="text-muted-foreground">Weight / cap</dt>
              <dd>
                {campaign.weight} / {campaign.frequencyCapPerHour ?? 'no'} per hour
              </dd>
              <dt className="text-muted-foreground">Creatives</dt>
              <dd>{campaign.creativeIds.length}</dd>
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
