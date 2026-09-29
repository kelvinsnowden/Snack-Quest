import type { Metadata } from 'next';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { peerLearningService } from '@/services/peerLearningService';
import { machineRepository } from '@/repositories/machineRepository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { IntelligenceTabs } from '@/components/admin/vending/IntelligenceTabs';
import { ApplyPlanToMachine } from '@/components/admin/vending/ApplyPlanToMachine';
import { LOCATION_TYPE_OPTIONS } from '@/lib/vending/locationOptions';
import type { Location } from '@/types';

export const metadata: Metadata = { title: 'Plan a new machine' };

const NOT_YET_SELLING = new Set(['provisioning', 'installing', 'testing']);

/**
 * What to put in a new machine, from what sells at existing places of
 * the same type over the last 30 days: products ranked by average
 * revenue per location. A ranking of past sales, not a forecast. The
 * list can be added to a machine's catalogue (machine_catalog.manage);
 * prices, slots and stock are then set on that machine as usual.
 */
export default async function PlanMachinePage({ searchParams }: { searchParams: Promise<{ type?: string; slots?: string }> }) {
  const session = await requireStaffSession();
  const query = await searchParams;
  const type = LOCATION_TYPE_OPTIONS.find((option) => option.value === query.type)?.value ?? null;
  const slotCount = Math.min(Math.max(Number.parseInt(query.slots ?? '', 10) || 30, 1), 80);
  const plan = type ? await peerLearningService.recommendAssortmentForNewMachine(session.businessId, type as Location['locationType'], slotCount) : null;
  const canApply = hasPermission(session, 'machine_catalog.manage');
  const machines = canApply && plan && plan.length > 0 ? (await machineRepository.listByBusiness(session.businessId, { limit: 10000 })).machines.filter(({ data }) => data.status !== 'decommissioned') : [];
  machines.sort((a, b) => Number(NOT_YET_SELLING.has(b.data.status)) - Number(NOT_YET_SELLING.has(a.data.status)) || a.data.machineCode.localeCompare(b.data.machineCode));

  return (
    <div className="flex flex-col gap-6 p-6">
      <IntelligenceTabs current="plan" />
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Plan a new machine</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Choose the kind of place it’s going. You’ll get the products that earned the most per location at places of that kind in the last 30 days. It ranks past sales; it doesn’t predict them.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form method="get" className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="plan-type">Kind of place</Label>
              <select id="plan-type" name="type" defaultValue={type ?? ''} required className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
                <option value="" disabled>
                  Choose…
                </option>
                {LOCATION_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="plan-slots">How many products</Label>
              <Input id="plan-slots" name="slots" type="number" min={1} max={80} defaultValue={slotCount} className="w-28" />
            </div>
            <Button type="submit" size="sm">
              Suggest products
            </Button>
          </form>
        </CardContent>
      </Card>

      {plan ? (
        <Card>
          <CardHeader>
            <CardTitle>{plan.length === 0 ? 'Nothing to suggest yet' : `${plan.length} product${plan.length === 1 ? '' : 's'}`}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 p-0">
            {plan.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No existing place of this kind has sales in the last 30 days, so there’s nothing to learn from.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="px-6 py-3 font-medium">Product</th>
                        <th className="px-6 py-3 font-medium">Category</th>
                        <th className="px-6 py-3 text-right font-medium">Revenue per location</th>
                        <th className="px-6 py-3 text-right font-medium">Margin</th>
                        <th className="px-6 py-3 font-medium">Why</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {plan.map((row) => (
                        <tr key={row.productId} className="border-b border-border last:border-0 align-top">
                          <td className="px-6 py-3 font-medium text-foreground">{row.productName}</td>
                          <td className="px-6 py-3 text-muted-foreground">{row.category ?? '—'}</td>
                          <td className="px-6 py-3 text-right text-foreground">KES {row.avgRevenuePerLocationKes.toLocaleString('en-KE')}</td>
                          <td className="px-6 py-3 text-right text-muted-foreground">{row.avgMarginPct === null ? '—' : `${row.avgMarginPct}%`}</td>
                          <td className="px-6 py-3 text-muted-foreground">{row.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {canApply ? (
                  <div className="border-t border-border px-6 pb-6 pt-4">
                    <ApplyPlanToMachine
                      productIds={plan.map((row) => row.productId)}
                      machines={machines.map(({ id, data }) => ({ id, label: `${data.machineCode}${NOT_YET_SELLING.has(data.status) ? ' (not selling yet)' : ''}` }))}
                    />
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
