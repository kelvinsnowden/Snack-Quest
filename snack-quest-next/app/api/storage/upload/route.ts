import { storageService } from '@/services/storageService';
import { StorageUploadError, StorageValidationError } from '@/lib/storage/errors';
import { STORAGE_DIRECTORIES, isStorageDirectory } from '@/lib/storage/policies';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { verifyCreatorSessionFromRequest } from '@/lib/auth/creatorSession';

/**
 * The real upload wire for `services/storageService.ts` (§ Vercel
 * Blob migration's "Upload Flow": receive the file → validate → hand
 * to Vercel Blob → return the Blob URL). Multipart/form-data in, JSON
 * out — deliberately not saving the returned URL into any Firestore
 * document itself; the caller (e.g. `ProductService.updateProduct()`)
 * owns that write, same Repository/Service boundary as everywhere
 * else.
 *
 * Staff- or creator-session gated: `businessId` is taken from
 * whichever verified session made the request, never from the request
 * body, so a caller can never upload into another tenant's storage
 * path by supplying a different id. A creator-authenticated request is
 * additionally pinned to the `creators` directory — the only one this
 * route lets a non-staff caller write into.
 */
export async function POST(request: Request): Promise<Response> {
  const staffSession = await verifyStaffSessionFromRequest(request);
  const creatorSession = staffSession ? null : await verifyCreatorSessionFromRequest(request);
  const businessId = staffSession?.businessId ?? creatorSession?.businessId;
  if (!businessId) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'Expected multipart/form-data.' }, { status: 400 });
  }

  const file = formData.get('file');
  const directory = formData.get('directory');

  if (!(file instanceof File)) {
    return Response.json({ error: '"file" is required.' }, { status: 400 });
  }
  if (typeof directory !== 'string' || !isStorageDirectory(directory)) {
    return Response.json(
      { error: `"directory" must be one of: ${STORAGE_DIRECTORIES.join(', ')}.` },
      { status: 400 },
    );
  }
  if (creatorSession && directory !== 'creators') {
    return Response.json(
      { error: 'Creators can only upload to the "creators" directory.' },
      { status: 403 },
    );
  }

  const data = Buffer.from(await file.arrayBuffer());

  try {
    const uploaded = await storageService.uploadFile({
      businessId,
      directory,
      filename: file.name,
      data,
      contentType: file.type || 'application/octet-stream',
    });
    return Response.json(uploaded, { status: 201 });
  } catch (error) {
    if (error instanceof StorageValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof StorageUploadError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
