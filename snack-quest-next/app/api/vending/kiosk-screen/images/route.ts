import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { kioskScreenService, KioskScreenValidationError } from '@/services/kioskScreenService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { kioskScreenImageRepository } from '@/repositories/kioskScreenImageRepository';
import { serializeKioskScreenImage } from '@/lib/vending/serialize';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { isKioskScreenPlacement } from '@/types';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/**
 * Artwork for named parts of the customer machine screen (§ `KioskScreenImage`).
 * Staff only. `GET` lists every image in the tenant; `POST` adds one to
 * a placement, for the whole fleet (`machineId: null`) or one machine.
 * Upload the file first through `POST /api/storage/upload` (directory
 * `kiosk`) and pass the returned URL here.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'machines.view')) {
    return forbiddenForPermission('machines.view');
  }
  const rows = await kioskScreenService.list(session.businessId);
  return Response.json({ images: rows.map(({ id, data }) => serializeKioskScreenImage(id, data)) });
}

export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'machine_screen.manage')) {
    return forbiddenForPermission('machine_screen.manage');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { placement, machineId, imageUrl, altText } = (body ?? {}) as Record<string, unknown>;
  if (!isKioskScreenPlacement(placement)) {
    return Response.json({ error: 'placement must be one of: menu_banner, attract' }, { status: 400 });
  }
  if (machineId !== null && machineId !== undefined && (typeof machineId !== 'string' || !machineId)) {
    return Response.json({ error: 'machineId must be a machine id, or null for every machine' }, { status: 400 });
  }
  if (typeof imageUrl !== 'string' || typeof altText !== 'string') {
    return Response.json({ error: 'imageUrl and altText are required' }, { status: 400 });
  }

  try {
    const imageId = await kioskScreenService.addImage({
      businessId: session.businessId,
      placement,
      machineId: (machineId as string | null | undefined) ?? null,
      imageUrl,
      altText,
      actor: session.uid,
    });
    const created = await kioskScreenImageRepository.findById(session.businessId, imageId);
    const serialized = created ? serializeKioskScreenImage(imageId, created) : null;
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'kiosk_screen_image.add',
      entityType: 'kioskScreenImage',
      entityId: imageId,
      before: null,
      after: serialized as unknown as Record<string, unknown> | null,
      machineId: created?.machineId ?? null,
    });
    return Response.json({ image: serialized }, { status: 201 });
  } catch (error) {
    if (error instanceof KioskScreenValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof MachineNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
