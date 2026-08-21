import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import {
  marketingSmsService,
  MarketingSmsNotFoundError,
  MarketingSmsNotEditableError,
  MarketingSmsValidationError,
} from '@/services/marketingSmsService';
import { parseSmsDraftBody, type SmsDraftBody } from '@/lib/marketingSms/parseDraftBody';
import { serializeSmsCampaign } from '@/lib/marketingSms/serialize';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/** One campaign: read, edit while it is still a draft, or discard it (§ Admin: Marketing SMS). */

function errorResponse(error: unknown): Response | null {
  if (error instanceof MarketingSmsNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof MarketingSmsNotEditableError || error instanceof MarketingSmsValidationError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  return null;
}

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
    const campaign = await marketingSmsService.getCampaign(session.businessId, id);
    return Response.json({ campaign: serializeSmsCampaign(id, campaign) });
  } catch (error) {
    const response = errorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: SmsDraftBody;
  try {
    body = (await request.json()) as SmsDraftBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const parsed = parseSmsDraftBody(body);
  if ('error' in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const { id } = await params;
  try {
    await marketingSmsService.updateDraft(session.businessId, id, parsed.input, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'marketing_sms.update_draft',
      entityType: 'marketingSmsCampaign',
      entityId: id,
      after: { name: parsed.input.name, segment: parsed.input.segment },
    });
    return Response.json({ ok: true });
  } catch (error) {
    const response = errorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }
}

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
    await marketingSmsService.deleteDraft(session.businessId, id);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'marketing_sms.delete_draft',
      entityType: 'marketingSmsCampaign',
      entityId: id,
      after: null,
    });
    return Response.json({ ok: true });
  } catch (error) {
    const response = errorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }
}
