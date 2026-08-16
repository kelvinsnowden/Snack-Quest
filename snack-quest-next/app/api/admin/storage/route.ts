import {
  hasStaffRole,
  ADMIN_ONLY,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { storageService } from '@/services/storageService';
import {
  STORAGE_DIRECTORIES,
  isStorageDirectory,
} from '@/lib/storage/policies';
import { StorageUploadError } from '@/lib/storage/errors';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/** Lists what's actually stored for this business in one directory (§ Admin: Storage browser) — a real Vercel Blob listing, never a Firestore-derived guess. */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const { searchParams } = new URL(request.url);
  const directory = searchParams.get('directory');
  if (!directory || !isStorageDirectory(directory)) {
    return Response.json(
      {
        error: `"directory" query param must be one of: ${STORAGE_DIRECTORIES.join(', ')}.`,
      },
      { status: 400 },
    );
  }
  const cursor = searchParams.get('cursor') ?? undefined;

  const page = await storageService.listFiles(session.businessId, directory, {
    cursor,
  });
  return Response.json(page);
}

/** Deletes a single stored object by URL (§ Admin: Storage browser) — the URL must fall under this business's own prefix for this directory, so one tenant can never delete another's file by guessing a URL. */
export async function DELETE(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { url, directory } = (body ?? {}) as {
    url?: unknown;
    directory?: unknown;
  };
  if (typeof url !== 'string' || url.trim().length === 0) {
    return Response.json({ error: '"url" is required.' }, { status: 400 });
  }
  if (typeof directory !== 'string' || !isStorageDirectory(directory)) {
    return Response.json(
      {
        error: `"directory" must be one of: ${STORAGE_DIRECTORIES.join(', ')}.`,
      },
      { status: 400 },
    );
  }

  const requiredPrefix = `/${directory}/${session.businessId}/`;
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return Response.json(
      { error: '"url" is not a valid URL.' },
      { status: 400 },
    );
  }
  if (!pathname.startsWith(requiredPrefix)) {
    return Response.json(
      { error: 'That object does not belong to this business/directory.' },
      { status: 403 },
    );
  }

  try {
    await storageService.deleteFile(url);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'storage.delete',
      entityType: 'storageObject',
      entityId: pathname,
      before: { url, directory },
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof StorageUploadError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
