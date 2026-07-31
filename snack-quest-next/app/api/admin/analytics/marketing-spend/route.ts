import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { businessAnalyticsService } from '@/services/businessAnalyticsService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Records a business's total marketing spend for one month (§ Admin: Analytics) — the manual input `getCac()` computes CAC from. */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { month, amountKes } = (body ?? {}) as { month?: unknown; amountKes?: unknown };
  if (typeof month !== 'string' || !MONTH_PATTERN.test(month)) {
    return Response.json({ error: '"month" must be in YYYY-MM format.' }, { status: 400 });
  }
  if (typeof amountKes !== 'number' || !Number.isFinite(amountKes) || amountKes < 0) {
    return Response.json({ error: '"amountKes" must be a non-negative number.' }, { status: 400 });
  }

  await businessAnalyticsService.setMarketingSpend(session.businessId, month, amountKes, session.uid);
  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.uid,
    action: 'marketing_spend.set',
    entityType: 'marketingSpendEntry',
    entityId: month,
    after: { month, amountKes },
  });
  return Response.json({ ok: true });
}
