import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import {
  marketingSmsService,
  MarketingSmsNotFoundError,
  MarketingSmsValidationError,
} from '@/services/marketingSmsService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/** Retries exactly the recipients a prior attempt failed for — never the whole list again (§ Admin: Marketing SMS). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id } = await params;
  try {
    const result = await marketingSmsService.resendFailed(session.businessId, id, session.uid);

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'marketing_sms.resend_failed',
      entityType: 'marketingSmsCampaign',
      entityId: id,
      after: {
        recipientCount: result.recipientCount,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        totalSegmentsSent: result.totalSegmentsSent,
      },
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof MarketingSmsNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof MarketingSmsValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
