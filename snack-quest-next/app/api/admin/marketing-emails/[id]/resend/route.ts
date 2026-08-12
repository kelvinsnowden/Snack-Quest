import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import {
  marketingEmailService,
  MarketingEmailNotFoundError,
  MarketingEmailValidationError,
} from '@/services/marketingEmailService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

// Same real-SMTP-loop headroom as the initial send route.
export const maxDuration = 300;

/**
 * Retries only the recipients a prior send/resend failed for, with the
 * exact content that already sent successfully to everyone else (§
 * Admin: Marketing Emails) — never recomposes the campaign.
 */
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
    const result = await marketingEmailService.resendFailed(session.businessId, id, session.uid);

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'marketing_email.resend_failed',
      entityType: 'marketingEmailCampaign',
      entityId: id,
      after: { ...result },
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof MarketingEmailNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof MarketingEmailValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
