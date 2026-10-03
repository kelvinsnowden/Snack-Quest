import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { alertService } from '@/services/alertService';
import { serializeAlert } from '@/lib/vending/serialize';
import type { AlertSeverity, AlertType } from '@/types';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

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
  'dispense_conflict',
  'integration_issue',
  'manufacturer_outage',
  'job_failure',
  'dispense_failures',
  'dispense_timeout_rate',
  'manufacturer_api_unavailable',
  'integration_auth_failures',
  'credential_expiring',
  'credential_revoked',
  'webhook_failures',
];
const ALERT_SEVERITIES: AlertSeverity[] = ['critical', 'warning', 'info'];

/**
 * § PART 6 — ALERT CENTER. Lists open alerts as the last sweep left
 * them. The sweep reads the whole fleet, so it runs on the schedule
 * (vending-fast-recovery, every few minutes) and on "Check now"
 * (`POST /api/vending/alerts/evaluate`), never on a read.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'alerts.view')) {
    return forbiddenForPermission('alerts.view');
  }

  const url = new URL(request.url);
  const typeParam = url.searchParams.get('type');
  const severityParam = url.searchParams.get('severity');
  const machineId = url.searchParams.get('machineId') ?? undefined;
  const type = typeParam && (ALERT_TYPES as string[]).includes(typeParam) ? (typeParam as AlertType) : undefined;
  const severity = severityParam && (ALERT_SEVERITIES as string[]).includes(severityParam) ? (severityParam as AlertSeverity) : undefined;

  const [alerts, lastEvaluatedAt] = await Promise.all([alertService.listOpen(session.businessId, { type, severity, machineId }), alertService.lastEvaluatedAt(session.businessId)]);
  return Response.json({ alerts: alerts.map(({ id, data }) => serializeAlert(id, data)), lastEvaluatedAt: lastEvaluatedAt ? lastEvaluatedAt.toISOString() : null });
}
