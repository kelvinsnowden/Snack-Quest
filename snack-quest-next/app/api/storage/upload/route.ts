import { storageService } from '@/services/storageService';
import { StorageUploadError, StorageValidationError } from '@/lib/storage/errors';
import { STORAGE_DIRECTORIES, isStorageDirectory } from '@/lib/storage/policies';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';

/**
 * The real upload wire for `services/storageService.ts` (§ Vercel
 * Blob migration's "Upload Flow": receive the file → validate → hand
 * to Vercel Blob → return the Blob URL). Multipart/form-data in, JSON
 * out — deliberately not saving the returned URL into any Firestore
 * document itself; the caller (e.g. `ProductService.updateProduct()`)
 * owns that write, same Repository/Service boundary as everywhere
 * else.
 *
 * Staff-session gated (§ Admin: Products & Packages — the first real
 * caller of this route): `businessId` is taken from the verified
 * session, never from the request body, so a caller can never upload
 * into another tenant's storage path by supplying a different id.
 * Creator-facing uploads will need their own auth path once the
 * Creator Portal has real sessions (§ Creator Portal) — not added here
 * speculatively.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
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

  const data = Buffer.from(await file.arrayBuffer());

  try {
    const uploaded = await storageService.uploadFile({
      businessId: session.businessId,
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
