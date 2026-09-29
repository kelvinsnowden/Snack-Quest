import { isAuthorizedCronRequest } from '@/lib/auth/cronAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { scheduledJobService } from '@/services/scheduledJobService';
import { rebuildVendingRollups } from '@/services/jobs/rebuildVendingRollups';

/**
 * Keeps `machineDailySummary`, `partnerDailySummary` and
 * `networkDailySummary` current without a fleet, partner, or network
 * dashboard load paying for the rebuild (§ ANALYTICS, § NETWORK
 * INTELLIGENCE, mirrors `rebuild-analytics-rollups` exactly — see that
 * route and docs/ANALYTICS_ROLLUPS.md §3 for why this pairing of
 * "cron keeps it warm" with "a missing day self-heals on read"
 * — `vendingRollupService.computePartnerDay`/`computeNetworkDay` — is
 * the shape to keep, not a fresh one).
 *
 * The last three days are rebuilt for every machine, then for every
 * partner, same three-day margin `rebuild-analytics-rollups` uses for
 * traffic: a device can report late against a stale clock, and a
 * rebuild is idempotent, so recovering a day this job already handled
 * correctly costs a cheap read and changes nothing.
 *
 * Fans out per machine and per partner rather than one combined write —
 * this is the fleet's own version of the "no single fleet-wide
 * document" rule the brief and `docs/ANALYTICS_ROLLUPS.md` both state:
 * a fleet of N machines produces N small writes here, never one
 * document every machine's rebuild would contend on. Load-tested only
 * informally so far; `docs/FLEET_ARCHITECTURE_AUDIT.md` §7 already
 * flags synthetic load testing at 50/100/500 machines as not yet done,
 * and that gap applies to this job's own runtime just as much as to
 * the dashboards it feeds.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const businessId = getCurrentBusinessId();
  const outcome = await scheduledJobService.run(businessId, 'rebuild-vending-rollups', (job) => rebuildVendingRollups(businessId, job));
  return scheduledJobService.toResponse(outcome);
}
