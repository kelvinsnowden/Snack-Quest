import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { alertService } from '@/services/alertService';
import { serializeAlert } from '@/lib/vending/serialize';
import type { AlertSeverity, AlertType } from '@/types';

const ALERT_TYPES: AlertType[] = [
  'machine_offline',
  'heartbeat_missing',
  'stockout',
  'stockout_risk',
  'machine_fault',
  'payment_reconciliation_issue',
  'inventory_discrepancy',
  'expiry_risk',
  'subscription_issue',
  'settlement_failure',
];
const ALERT_SEVERITIES: AlertSeverity[] = ['critical', 'warning', 'info'];

/**
 * § PART 6 — ALERT CENTER. Runs `evaluateAndSync` first, on every
 * call — the sweep is cheap and idempotent (it upserts/auto-resolves
 * against live state), so the Alert Center's own list is always at
 * most one page load stale, never a stored view that could drift
 * from what `machines`/`machineSlots`/etc. actually say right now.
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
  const typeParam = url.searchParams.get('type');
  const severityParam = url.searchParams.get('severity');
  const machineId = url.searchParams.get('machineId') ?? undefined;
  const type = typeParam && (ALERT_TYPES as string[]).includes(typeParam) ? (typeParam as AlertType) : undefined;
  const severity = severityParam && (ALERT_SEVERITIES as string[]).includes(severityParam) ? (severityParam as AlertSeverity) : undefined;

  await alertService.evaluateAndSync(session.businessId);
  const alerts = await alertService.listOpen(session.businessId, { type, severity, machineId });
  return Response.json({ alerts: alerts.map(({ id, data }) => serializeAlert(id, data)) });
}
