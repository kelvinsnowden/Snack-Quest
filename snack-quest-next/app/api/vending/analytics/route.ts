import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { vendingRollupService } from '@/services/vendingRollupService';
import { machineDailySummaryRepository } from '@/repositories/machineDailySummaryRepository';
import { partnerDailySummaryRepository } from '@/repositories/partnerDailySummaryRepository';
import { serializeMachineDailySummary, serializePartnerDailySummary } from '@/lib/vending/serialize';
import { dateKey } from '@/lib/analytics/dateKey';

const MAX_RANGE_DAYS = 92;

/**
 * The fleet's read model (§ ANALYTICS, docs/ANALYTICS_ROLLUPS.md §3):
 * a range read over `machineDailySummary`/`partnerDailySummary`, never
 * a live scan of `machineTransactions`. Every completed day missing a
 * stored rollup is healed on the spot and persisted, the same
 * self-healing `getTraffic` already does for `trafficDaily`; today is
 * always computed live and never written, because today is not over.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get('scope');
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');

  if (scope !== 'machine' && scope !== 'partner') {
    return Response.json({ error: 'scope must be "machine" or "partner"' }, { status: 400 });
  }
  if (!startDate || !endDate || !isDateKey(startDate) || !isDateKey(endDate)) {
    return Response.json({ error: 'startDate and endDate are required, as YYYY-MM-DD' }, { status: 400 });
  }
  if (startDate > endDate) {
    return Response.json({ error: 'startDate must not be after endDate' }, { status: 400 });
  }
  if (daysBetween(startDate, endDate) > MAX_RANGE_DAYS) {
    return Response.json({ error: `range must not exceed ${MAX_RANGE_DAYS} days` }, { status: 400 });
  }

  const today = dateKey(new Date());

  if (scope === 'machine') {
    const machineId = url.searchParams.get('machineId');
    if (!machineId) {
      return Response.json({ error: 'machineId query parameter is required for scope=machine' }, { status: 400 });
    }

    const days: Record<string, ReturnType<typeof serializeMachineDailySummary>> = {};
    const stored = await machineDailySummaryRepository.listRange(session.businessId, machineId, startDate, endDate);
    for (const date of datesBetween(startDate, endDate)) {
      if (date >= today) {
        // Today is still accumulating — computed live and never persisted, so it's never routed through `serializeMachineDailySummary` either, which expects a real stored `Timestamp`.
        const live = await vendingRollupService.computeMachineDay(session.businessId, machineId, date);
        days[date] = { ...live, businessId: session.businessId, machineId, date, rebuiltAt: new Date().toISOString() };
        continue;
      }
      const existing = stored.get(date);
      if (existing) {
        days[date] = serializeMachineDailySummary(existing);
        continue;
      }
      const healed = await vendingRollupService.rebuildMachineDay(session.businessId, machineId, date);
      days[date] = { ...healed, businessId: session.businessId, machineId, date, rebuiltAt: new Date().toISOString() };
    }
    return Response.json({ scope, machineId, days });
  }

  const partnerId = url.searchParams.get('partnerId');
  if (!partnerId) {
    return Response.json({ error: 'partnerId query parameter is required for scope=partner' }, { status: 400 });
  }

  const days: Record<string, ReturnType<typeof serializePartnerDailySummary>> = {};
  const stored = await partnerDailySummaryRepository.listRange(session.businessId, partnerId, startDate, endDate);
  for (const date of datesBetween(startDate, endDate)) {
    if (date >= today) {
      const live = await vendingRollupService.computePartnerDay(session.businessId, partnerId, date);
      days[date] = { ...live, businessId: session.businessId, partnerId, date, rebuiltAt: new Date().toISOString() };
      continue;
    }
    const existing = stored.get(date);
    if (existing) {
      days[date] = serializePartnerDailySummary(existing);
      continue;
    }
    const healed = await vendingRollupService.rebuildPartnerDay(session.businessId, partnerId, date);
    days[date] = { ...healed, businessId: session.businessId, partnerId, date, rebuiltAt: new Date().toISOString() };
  }
  return Response.json({ scope, partnerId, days });
}

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

function* datesBetween(startDate: string, endDate: string): Generator<string> {
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    yield dateKey(cursor);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}
