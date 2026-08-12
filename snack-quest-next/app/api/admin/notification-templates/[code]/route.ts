import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import {
  notificationTemplateService,
  NotificationTemplateNotFoundError,
  NotificationTemplateValidationError,
  type NotificationTemplateUpdateInput,
} from '@/services/notificationTemplateService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

interface UpdateBody {
  subject?: unknown;
  heading?: unknown;
  bodyTemplate?: unknown;
  ctaLabel?: unknown;
  ctaUrl?: unknown;
  isActive?: unknown;
}

function errorResponse(error: unknown): Response {
  if (error instanceof NotificationTemplateNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof NotificationTemplateValidationError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  throw error;
}

/** A single template, by code — the edit view's initial load (§ Admin: Notification Templates). */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { code } = await params;
  try {
    const template = await notificationTemplateService.getByCode(code);
    return Response.json({ template });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Edits a template's content and/or flips it active/inactive — the one real "does this event's email fire" switch (§ Admin: Notification Templates). */
export async function PATCH(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { code } = await params;

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (typeof body.bodyTemplate !== 'string') {
    return Response.json({ error: '"bodyTemplate" must be a string.' }, { status: 400 });
  }
  if (body.subject !== undefined && body.subject !== null && typeof body.subject !== 'string') {
    return Response.json({ error: '"subject" must be a string or null.' }, { status: 400 });
  }
  if (body.heading !== undefined && body.heading !== null && typeof body.heading !== 'string') {
    return Response.json({ error: '"heading" must be a string or null.' }, { status: 400 });
  }
  if (body.ctaLabel !== undefined && body.ctaLabel !== null && typeof body.ctaLabel !== 'string') {
    return Response.json({ error: '"ctaLabel" must be a string or null.' }, { status: 400 });
  }
  if (body.ctaUrl !== undefined && body.ctaUrl !== null && typeof body.ctaUrl !== 'string') {
    return Response.json({ error: '"ctaUrl" must be a string or null.' }, { status: 400 });
  }
  if (typeof body.isActive !== 'boolean') {
    return Response.json({ error: '"isActive" must be a boolean.' }, { status: 400 });
  }

  const input: NotificationTemplateUpdateInput = {
    subject: (body.subject as string | null | undefined) ?? null,
    heading: (body.heading as string | null | undefined) ?? null,
    bodyTemplate: body.bodyTemplate,
    ctaLabel: (body.ctaLabel as string | null | undefined) ?? null,
    ctaUrl: (body.ctaUrl as string | null | undefined) ?? null,
    isActive: body.isActive,
  };

  try {
    await notificationTemplateService.updateTemplate(code, input);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'notification_template.update',
      entityType: 'notificationTemplate',
      entityId: code,
      after: { subject: input.subject, isActive: input.isActive },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
