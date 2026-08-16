import {
  hasStaffRole,
  ADMIN_ONLY,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { businessAnalyticsService } from '@/services/businessAnalyticsService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function isValidOptionalAmount(value: unknown): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === 'number' && Number.isFinite(value) && value >= 0)
  );
}

/**
 * Records a business's total marketing spend for one month, and
 * optionally its per-channel split (§ close the loop: ad-conversion
 * attribution) — the manual input `getCac()`/`getCacByChannel()`
 * compute CAC from.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { month, amountKes, metaSpendKes, tiktokSpendKes } = (body ?? {}) as {
    month?: unknown;
    amountKes?: unknown;
    metaSpendKes?: unknown;
    tiktokSpendKes?: unknown;
  };
  if (typeof month !== 'string' || !MONTH_PATTERN.test(month)) {
    return Response.json(
      { error: '"month" must be in YYYY-MM format.' },
      { status: 400 },
    );
  }
  if (
    typeof amountKes !== 'number' ||
    !Number.isFinite(amountKes) ||
    amountKes < 0
  ) {
    return Response.json(
      { error: '"amountKes" must be a non-negative number.' },
      { status: 400 },
    );
  }
  if (!isValidOptionalAmount(metaSpendKes)) {
    return Response.json(
      { error: '"metaSpendKes" must be a non-negative number when provided.' },
      { status: 400 },
    );
  }
  if (!isValidOptionalAmount(tiktokSpendKes)) {
    return Response.json(
      {
        error: '"tiktokSpendKes" must be a non-negative number when provided.',
      },
      { status: 400 },
    );
  }

  await businessAnalyticsService.setMarketingSpend(
    session.businessId,
    month,
    amountKes,
    session.uid,
    {
      metaSpendKes,
      tiktokSpendKes,
    },
  );
  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.uid,
    action: 'marketing_spend.set',
    entityType: 'marketingSpendEntry',
    entityId: month,
    // Omitted entirely (not `undefined`) when unset — Firestore rejects an explicit `undefined` field value.
    after: {
      month,
      amountKes,
      ...(metaSpendKes !== undefined ? { metaSpendKes } : {}),
      ...(tiktokSpendKes !== undefined ? { tiktokSpendKes } : {}),
    },
  });
  return Response.json({ ok: true });
}
