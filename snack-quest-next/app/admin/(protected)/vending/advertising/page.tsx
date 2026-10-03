import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdminPage } from '@/lib/auth/requireAdminSection';
import { hasAnyPermission, hasPermission } from '@/lib/auth/permissions';
import { advertisingService } from '@/services/advertisingService';
import { machineRepository } from '@/repositories/machineRepository';
import { locationRepository } from '@/repositories/locationRepository';
import { partnerRepository } from '@/repositories/partnerRepository';
import { nairobiClock } from '@/lib/ads/playlist';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AdvertiserActiveToggle,
  AdvertiserForm,
  CampaignForm,
  CampaignStatusActions,
  ComputeRevenueButton,
  CreativeReview,
  CreativeUploadForm,
} from '@/components/admin/vending/AdvertisingControls';
import { AD_BILLING_LABEL, type AdCampaignStatus } from '@/types';

export const metadata: Metadata = { title: 'Advertising' };

const STATUS_LABEL: Record<AdCampaignStatus, string> = {
  draft: 'Draft',
  active: 'Running',
  paused: 'Paused',
  ended: 'Ended',
  cancelled: 'Cancelled',
};
const STATUS_TONE: Record<AdCampaignStatus, string> = {
  draft: 'bg-muted/20 text-muted-foreground',
  active: 'bg-success/15 text-success',
  paused: 'bg-warning/15 text-warning',
  ended: 'bg-muted/20 text-muted-foreground',
  cancelled: 'bg-muted/20 text-muted-foreground',
};
/** The Nairobi date `days` days ago. */
function nairobiDaysAgo(days: number): string {
  return nairobiClock(new Date(Date.now() - days * 86_400_000)).date;
}

const kes = (value: number) =>
  `KES ${value.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;
const pct = (value: number | null) =>
  value === null ? '—' : `${Math.round(value * 100)}%`;

/**
 * Advertising on the machines' idle screens (§ IDLE / ATTRACT ADVERTISING
 * ENGINE): performance, campaigns, creatives waiting for review,
 * advertisers and — for finance — revenue and owner shares. Each part
 * appears only for people whose permissions allow it.
 */
export default async function AdvertisingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await requireAdminPage('vending', 'advertising.view');
  const canManage = hasPermission(session, 'advertising.manage');
  const canReview = hasPermission(session, 'advertising.review');
  const canPublish = hasPermission(session, 'advertising.publish');
  const canSeeRevenue = hasAnyPermission(session, [
    'finance.view',
    'finance.machine_pnl.view',
  ]);
  const today = nairobiClock(new Date()).date;
  const month = /^\d{4}-\d{2}$/.test((await searchParams).month ?? '')
    ? (await searchParams).month!
    : today.slice(0, 7);
  const lastMonth = new Date(
    Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1),
  )
    .toISOString()
    .slice(0, 7);

  const [
    advertisers,
    creatives,
    campaigns,
    stats,
    machines,
    locations,
    owners,
    revenue,
  ] = await Promise.all([
    advertisingService.listAdvertisers(session.businessId),
    advertisingService.listCreatives(session.businessId),
    advertisingService.listCampaigns(session.businessId),
    advertisingService.campaignStats(
      session.businessId,
      nairobiDaysAgo(29),
      today,
    ),
    canManage
      ? machineRepository.listAllForBusiness(session.businessId)
      : Promise.resolve([]),
    canManage
      ? locationRepository.listByBusiness(session.businessId)
      : Promise.resolve([]),
    canManage
      ? partnerRepository.listByBusiness(session.businessId)
      : Promise.resolve([]),
    canSeeRevenue
      ? advertisingService.listRevenue(session.businessId, month)
      : Promise.resolve([]),
  ]);
  const advertiserName = new Map(
    advertisers.map(({ id, data }) => [id, data.name]),
  );
  const statsByCampaign = new Map(stats.map((row) => [row.campaignId, row]));
  const campaignName = new Map(
    campaigns.map(({ id, data }) => [id, data.name]),
  );
  const pending = creatives.filter(
    ({ data }) => data.status === 'pending_review',
  );
  const order: AdCampaignStatus[] = [
    'active',
    'paused',
    'draft',
    'ended',
    'cancelled',
  ];
  const sortedCampaigns = [...campaigns].sort(
    (a, b) =>
      order.indexOf(a.data.status) - order.indexOf(b.data.status) ||
      a.data.name.localeCompare(b.data.name),
  );
  const activeAdvertisers = advertisers.filter(({ data }) => data.active);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-foreground text-2xl font-semibold">Advertising</h1>
        <p className="text-muted-foreground max-w-prose text-sm">
          Ads play on a machine’s idle screen only — never while someone is
          buying — and only on machines whose{' '}
          <Link
            href="/admin/vending/kiosk-design"
            className="text-primary hover:underline"
          >
            screen design
          </Link>{' '}
          allows them. Every creative is reviewed before it can play.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaigns — last 30 days</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-caption text-muted-foreground border-b text-left tracking-wide uppercase">
                <th className="px-4 py-2">Campaign</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Plays</th>
                <th className="px-4 py-2 text-right">Finished</th>
                <th
                  className="px-4 py-2 text-right"
                  title="Taps on the screen during or just after the ad. Not a sale, and not proof the ad caused anything."
                >
                  Taps after
                </th>
                <th className="px-4 py-2 text-right">Machines</th>
                <th className="px-4 py-2">Billing</th>
                {canPublish ? <th className="px-4 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {sortedCampaigns.map(({ id, data }) => {
                const row = statsByCampaign.get(id);
                return (
                  <tr
                    key={id}
                    className="border-border border-b align-top last:border-0"
                  >
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/vending/advertising/campaigns/${id}`}
                        className="text-primary font-medium hover:underline"
                      >
                        {data.name}
                      </Link>
                      <span className="text-caption text-muted-foreground block">
                        {advertiserName.get(data.advertiserId) ??
                          'Unknown advertiser'}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`text-caption rounded-full px-2 py-0.5 font-medium ${STATUS_TONE[data.status]}`}
                      >
                        {STATUS_LABEL[data.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {row?.started ?? 0}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {pct(row?.completionRate ?? null)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {pct(row?.interactionRate ?? null)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {row?.machines ?? 0}
                    </td>
                    <td className="text-muted-foreground px-4 py-2">
                      {AD_BILLING_LABEL[data.billingModel]}
                      {data.billingModel !== 'none' && canSeeRevenue
                        ? ` · ${kes(data.priceKes)}`
                        : ''}
                    </td>
                    {canPublish ? (
                      <td className="px-4 py-2">
                        <CampaignStatusActions
                          campaignId={id}
                          status={data.status}
                        />
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {campaigns.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="text-muted-foreground px-4 py-8 text-center"
                  >
                    No campaigns yet.{' '}
                    {canManage
                      ? 'Add an advertiser and a creative, then create one below.'
                      : ''}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {canReview || pending.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Creatives waiting for review ({pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {pending.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing waiting.</p>
            ) : null}
            {pending.map(({ id, data }) => (
              <div
                key={id}
                className="border-border flex flex-col gap-3 rounded-md border p-3 sm:flex-row"
              >
                <div className="bg-muted/10 aspect-video w-full shrink-0 overflow-hidden rounded-md sm:w-64">
                  {data.mediaKind === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element -- an uploaded creative from storage.
                    <img
                      src={data.mediaUrl}
                      alt={data.name}
                      className="size-full object-contain"
                    />
                  ) : (
                    <video
                      src={data.mediaUrl}
                      controls
                      muted
                      className="size-full object-contain"
                    />
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 text-sm">
                  <p className="font-medium">{data.name}</p>
                  <p className="text-muted-foreground">
                    {advertiserName.get(data.advertiserId)} · {data.mimeType} ·{' '}
                    {(data.bytes / 1024).toFixed(0)} KB · {data.durationSeconds}
                    s
                  </p>
                  <p className="text-caption text-muted-foreground font-mono break-all">
                    sha256 {data.sha256}
                  </p>
                  {canReview ? (
                    <CreativeReview creativeId={id} status={data.status} />
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New campaign</CardTitle>
          </CardHeader>
          <CardContent>
            {activeAdvertisers.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Add an advertiser first.
              </p>
            ) : (
              <CampaignForm
                advertisers={activeAdvertisers.map(({ id, data }) => ({
                  id,
                  name: data.name,
                  kind: data.kind,
                }))}
                creatives={creatives.map(({ id, data }) => ({
                  id,
                  name: data.name,
                  advertiserId: data.advertiserId,
                  status: data.status,
                }))}
                machines={machines
                  .filter(({ data }) => data.status !== 'decommissioned')
                  .map(({ id, data }) => ({ id, name: data.machineCode }))
                  .sort((a, b) => a.name.localeCompare(b.name))}
                locations={locations
                  .map(({ id, data }) => ({ id, name: data.name }))
                  .sort((a, b) => a.name.localeCompare(b.name))}
                owners={owners
                  .map(({ id, data }) => ({ id, name: data.name }))
                  .sort((a, b) => a.name.localeCompare(b.name))}
                today={today}
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Creatives</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="divide-border divide-y text-sm">
            {creatives
              .filter(({ data }) => data.status !== 'pending_review')
              .map(({ id, data }) => (
                <li
                  key={id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span>
                    <span className="font-medium">{data.name}</span>
                    <span className="text-caption text-muted-foreground block">
                      {advertiserName.get(data.advertiserId)} · {data.mediaKind}{' '}
                      ·{' '}
                      {data.status === 'approved'
                        ? 'approved'
                        : `rejected: ${data.reviewNote ?? ''}`}
                    </span>
                  </span>
                  {canReview && data.status === 'approved' ? (
                    <CreativeReview creativeId={id} status={data.status} />
                  ) : null}
                </li>
              ))}
          </ul>
          {canManage && activeAdvertisers.length > 0 ? (
            <div className="border-border border-t pt-4">
              <p className="mb-3 text-sm font-medium">Upload a creative</p>
              <CreativeUploadForm
                advertisers={activeAdvertisers.map(({ id, data }) => ({
                  id,
                  name: data.name,
                }))}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Advertisers</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="divide-border divide-y text-sm">
            {advertisers.map(({ id, data }) => (
              <li
                key={id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  <span className="font-medium">{data.name}</span>
                  <span className="text-caption text-muted-foreground block">
                    {data.kind === 'internal'
                      ? 'Snack Quest (not billed)'
                      : 'Paying brand'}
                    {data.contactName ? ` · ${data.contactName}` : ''}
                    {data.contactEmail ? ` · ${data.contactEmail}` : ''}
                    {data.active ? '' : ' · inactive'}
                  </span>
                </span>
                {canManage ? (
                  <AdvertiserActiveToggle
                    advertiserId={id}
                    active={data.active}
                  />
                ) : null}
              </li>
            ))}
          </ul>
          {canManage ? (
            <div className="border-border border-t pt-4">
              <AdvertiserForm />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {canSeeRevenue ? (
        <Card>
          <CardHeader className="flex flex-col gap-3">
            <CardTitle className="text-base">Revenue — {month}</CardTitle>
            <nav aria-label="Month" className="flex flex-wrap gap-3 text-sm">
              {[today.slice(0, 7), lastMonth].map((option) => (
                <Link
                  key={option}
                  href={`/admin/vending/advertising?month=${option}`}
                  className={
                    option === month
                      ? 'text-foreground font-semibold'
                      : 'text-primary hover:underline'
                  }
                >
                  {option}
                </Link>
              ))}
            </nav>
            <ComputeRevenueButton month={month} />
            <p className="text-caption text-muted-foreground">
              Earnings under each campaign’s price, from completed plays.
              Owners’ shares follow their agreements (0% unless set). Estimates
              to invoice from — not invoices, and never mixed into product
              margin.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border text-caption text-muted-foreground border-b text-left tracking-wide uppercase">
                  <th className="px-4 py-2">Campaign</th>
                  <th className="px-4 py-2 text-right">Billed units</th>
                  <th className="px-4 py-2 text-right">Earned</th>
                  <th className="px-4 py-2 text-right">Owners’ share</th>
                  <th className="px-4 py-2 text-right">Snack Quest</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {revenue.map((entry) => (
                  <tr
                    key={entry.campaignId}
                    className="border-border border-b last:border-0"
                  >
                    <td className="px-4 py-2">
                      {campaignName.get(entry.campaignId) ?? entry.campaignId}
                      <span className="text-caption text-muted-foreground block">
                        {AD_BILLING_LABEL[entry.billingModel]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {entry.billableUnits}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {kes(entry.grossKes)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {kes(entry.ownerTotalKes)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {kes(entry.snackQuestKes)}
                    </td>
                  </tr>
                ))}
                {revenue.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="text-muted-foreground px-4 py-6 text-center"
                    >
                      Not worked out for {month} yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
