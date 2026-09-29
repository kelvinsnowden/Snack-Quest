import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { kioskScreenService, KioskScreenValidationError } from '@/services/kioskScreenService';
import { kioskScreenImageRepository, KioskScreenImageNotFoundError } from '@/repositories/kioskScreenImageRepository';
import { serializeKioskScreenImage } from '@/lib/vending/serialize';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

type RouteParams = { imageId: string };

/**
 * One kiosk screen image. `PATCH` changes its description, switches it
 * on or off, or moves it a step in its rotation (`move: "earlier" |
 * "later"`); `DELETE` removes it from every screen. Staff only.
 */
export async function PATCH(request: Request, { params }: { params: Promise<RouteParams> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'machine_screen.manage')) {
    return forbiddenForPermission('machine_screen.manage');
  }
  const { imageId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { altText, active, move } = (body ?? {}) as Record<string, unknown>;
  if (altText === undefined && active === undefined && move === undefined) {
    return Response.json({ error: 'at least one of altText, active, move is required' }, { status: 400 });
  }
  if (altText !== undefined && typeof altText !== 'string') {
    return Response.json({ error: 'altText must be a string' }, { status: 400 });
  }
  if (active !== undefined && typeof active !== 'boolean') {
    return Response.json({ error: 'active must be a boolean' }, { status: 400 });
  }
  if (move !== undefined && move !== 'earlier' && move !== 'later') {
    return Response.json({ error: 'move must be "earlier" or "later"' }, { status: 400 });
  }

  const before = await kioskScreenImageRepository.findById(session.businessId, imageId);
  if (!before) {
    return Response.json({ error: `Kiosk screen image ${imageId} not found` }, { status: 404 });
  }

  try {
    if (altText !== undefined || active !== undefined) {
      await kioskScreenService.updateImage(session.businessId, imageId, { altText: altText as string | undefined, active: active as boolean | undefined }, session.uid);
    }
    if (move !== undefined) {
      await kioskScreenService.moveImage(session.businessId, imageId, move as 'earlier' | 'later', session.uid);
    }
  } catch (error) {
    if (error instanceof KioskScreenValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof KioskScreenImageNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }

  const after = await kioskScreenImageRepository.findById(session.businessId, imageId);
  const serialized = after ? serializeKioskScreenImage(imageId, after) : null;
  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.uid,
    action: move !== undefined ? 'kiosk_screen_image.reorder' : 'kiosk_screen_image.update',
    entityType: 'kioskScreenImage',
    entityId: imageId,
    before: serializeKioskScreenImage(imageId, before) as unknown as Record<string, unknown>,
    after: serialized as unknown as Record<string, unknown> | null,
    machineId: before.machineId,
  });
  return Response.json({ image: serialized });
}

export async function DELETE(request: Request, { params }: { params: Promise<RouteParams> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'machine_screen.manage')) {
    return forbiddenForPermission('machine_screen.manage');
  }
  const { imageId } = await params;

  const before = await kioskScreenImageRepository.findById(session.businessId, imageId);
  if (!before) {
    return Response.json({ error: `Kiosk screen image ${imageId} not found` }, { status: 404 });
  }
  await kioskScreenService.deleteImage(session.businessId, imageId);
  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.uid,
    action: 'kiosk_screen_image.delete',
    entityType: 'kioskScreenImage',
    entityId: imageId,
    before: serializeKioskScreenImage(imageId, before) as unknown as Record<string, unknown>,
    after: null,
    machineId: before.machineId,
  });
  return new Response(null, { status: 204 });
}
