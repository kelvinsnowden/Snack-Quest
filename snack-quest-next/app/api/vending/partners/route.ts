import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import {
  partnerService,
  PartnerValidationError,
} from '@/services/partnerService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

const optionalString = (value: unknown) =>
  value === undefined || value === null
    ? null
    : typeof value === 'string'
      ? value
      : undefined;

/** Machine owners: list (`owners.view`) and add (`owners.manage`). Money fields are never set here — only settlements credit an owner. */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session)
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'owners.view'))
    return forbiddenForPermission('owners.view');
  const partners = await partnerService.listByBusiness(session.businessId);
  return Response.json({
    partners: partners.map(({ id, data }) => ({
      id,
      name: data.name,
      status: data.status,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      portalClaimed: data.authUid !== null,
    })),
  });
}

export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session)
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'owners.manage'))
    return forbiddenForPermission('owners.manage');

  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const contactEmail = optionalString(body.contactEmail);
  const contactPhone = optionalString(body.contactPhone);
  const note = optionalString(body.note);
  if (
    typeof body.name !== 'string' ||
    contactEmail === undefined ||
    contactPhone === undefined ||
    note === undefined
  ) {
    return Response.json(
      {
        error:
          'name must be a string; contactEmail, contactPhone and note must be strings or null',
      },
      { status: 400 },
    );
  }

  try {
    const partnerId = await partnerService.create({
      businessId: session.businessId,
      name: body.name,
      contactEmail,
      contactPhone,
      note,
      actor: session.uid,
    });
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'create_machine_owner',
      entityType: 'partner',
      entityId: partnerId,
      after: {
        name: body.name.trim(),
        contactEmail: contactEmail?.trim().toLowerCase() || null,
      },
    });
    return Response.json({ partnerId }, { status: 201 });
  } catch (error) {
    if (error instanceof PartnerValidationError)
      return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
