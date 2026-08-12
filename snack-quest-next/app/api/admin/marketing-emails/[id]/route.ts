import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import {
  marketingEmailService,
  MarketingEmailNotFoundError,
  MarketingEmailNotEditableError,
  MarketingEmailValidationError,
} from '@/services/marketingEmailService';
import { parseDraftBody, type DraftBody } from '@/lib/marketingEmails/parseDraftBody';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

function errorResponse(error: unknown): Response {
  if (error instanceof MarketingEmailNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof MarketingEmailNotEditableError || error instanceof MarketingEmailValidationError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  throw error;
}

/** A single campaign — the composer's edit view, or a sent campaign's read-only view (§ Admin: Marketing Emails). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id } = await params;
  try {
    const campaign = await marketingEmailService.getCampaign(session.businessId, id);
    return Response.json({ campaign });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Updates a draft campaign's content — refuses once it's sending/sent (§ Admin: Marketing Emails). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id } = await params;

  let body: DraftBody;
  try {
    body = (await request.json()) as DraftBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const parsed = parseDraftBody(body);
  if ('error' in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    await marketingEmailService.updateDraft(session.businessId, id, parsed.input, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'marketing_email.update_draft',
      entityType: 'marketingEmailCampaign',
      entityId: id,
      after: { subject: parsed.input.subject, segment: parsed.input.segment },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Deletes a draft campaign — refuses once it's sending/sent, so send history is never erasable (§ Admin: Marketing Emails). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id } = await params;
  try {
    await marketingEmailService.deleteDraft(session.businessId, id);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'marketing_email.delete_draft',
      entityType: 'marketingEmailCampaign',
      entityId: id,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
