import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import {
  marketingEmailService,
  MarketingEmailNotFoundError,
  MarketingEmailNotEditableError,
  MarketingEmailValidationError,
} from '@/services/marketingEmailService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

// A real per-recipient send loop over real SMTP/SendGrid connections
// can run well past the platform's default function timeout — this
// gives it real headroom. Vercel silently caps this to whatever the
// project's actual plan allows, so it's safe to declare even on a
// lower tier.
export const maxDuration = 300;

/**
 * Sends a draft campaign right now (§ Admin: Marketing Emails) —
 * real, immediate, and irreversible: every resolved recipient gets a
 * real email. The client is expected to have already shown a "Send to
 * N recipients?" confirmation before calling this.
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
    const result = await marketingEmailService.send(session.businessId, id, session.uid);

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'marketing_email.send',
      entityType: 'marketingEmailCampaign',
      entityId: id,
      after: { ...result },
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof MarketingEmailNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof MarketingEmailNotEditableError || error instanceof MarketingEmailValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
