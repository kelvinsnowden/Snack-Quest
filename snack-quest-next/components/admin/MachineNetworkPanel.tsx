import Link from 'next/link';
import { hasPermission, type PermissionHolder } from '@/lib/auth/permissions';
import { reconciliationChecksService } from '@/services/reconciliationChecksService';
import { advertisingService } from '@/services/advertisingService';
import { kioskExperienceService } from '@/services/kioskExperienceService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * The machine network at a glance on the admin home (§ ADMIN DASHBOARD):
 * record checks, screen designs and advertising. Each line appears only
 * for people whose permissions cover it; with none, the panel is absent.
 */
export async function MachineNetworkPanel({ session }: { session: PermissionHolder & { businessId: string } }) {
  const canChecks = hasPermission(session, 'sales.view');
  const canAds = hasPermission(session, 'advertising.view');
  const canDesigns = hasPermission(session, 'kiosk.view');
  if (!canChecks && !canAds && !canDesigns) return null;

  const [checks, campaigns, creatives, layers] = await Promise.all([
    canChecks ? reconciliationChecksService.run(session.businessId) : Promise.resolve(null),
    canAds ? advertisingService.listCampaigns(session.businessId) : Promise.resolve(null),
    canAds ? advertisingService.listCreatives(session.businessId) : Promise.resolve(null),
    canDesigns ? kioskExperienceService.listLayers(session.businessId) : Promise.resolve(null),
  ]);
  const failing = checks?.filter((check) => check.status !== 'ok') ?? [];
  const silentScreens = checks?.find((check) => check.key === 'screens_not_reporting')?.count ?? 0;

  const rows: { label: string; value: string; href: string; attention: boolean }[] = [];
  if (checks) rows.push({ label: 'Record checks', value: failing.length === 0 ? 'All pass' : `${failing.length} need a look`, href: '/admin/vending/reconciliation/checks', attention: failing.length > 0 });
  if (checks) rows.push({ label: 'Screens silent over an hour', value: String(silentScreens), href: '/admin/vending/reconciliation/checks', attention: silentScreens > 0 });
  if (campaigns) rows.push({ label: 'Ad campaigns running', value: String(campaigns.filter(({ data }) => data.status === 'active').length), href: '/admin/vending/advertising', attention: false });
  if (creatives) {
    const pending = creatives.filter(({ data }) => data.status === 'pending_review').length;
    rows.push({ label: 'Ads waiting for review', value: String(pending), href: '/admin/vending/advertising', attention: pending > 0 });
  }
  if (layers) rows.push({ label: 'Screen designs live', value: String(layers.filter(({ data }) => data.publishedVersionId).length), href: '/admin/vending/kiosk-design', attention: false });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Machine network</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-4">
              <Link href={row.href} className="text-muted-foreground hover:text-foreground hover:underline">
                {row.label}
              </Link>
              <span className={`font-medium tabular-nums ${row.attention ? 'text-warning' : 'text-foreground'}`}>{row.value}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
