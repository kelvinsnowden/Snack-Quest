import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  marketingSmsService,
  MarketingSmsNotFoundError,
  MarketingSmsNotEditableError,
  MarketingSmsValidationError,
} from '@/services/marketingSmsService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { hasPermission } from '@/lib/auth/permissions';

/**
 * Sends a drafted campaign (§ Admin: Marketing SMS).
 *
 * Audit-logged with what it actually cost, not just that it happened.
 * This is the one admin action that spends money per recipient with no
 * way to recall it, so "who sent what, to how many, for how many
 * segments" needs to be answerable later from the log alone.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'marketing.messages.send')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id } = await params;
  try {
    const result = await marketingSmsService.send(session.businessId, id, session.uid);

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'marketing_sms.send',
      entityType: 'marketingSmsCampaign',
      entityId: id,
      after: {
        recipientCount: result.recipientCount,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        optedOutSkippedCount: result.optedOutSkippedCount,
        totalSegmentsSent: result.totalSegmentsSent,
      },
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof MarketingSmsNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof MarketingSmsValidationError || error instanceof MarketingSmsNotEditableError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
