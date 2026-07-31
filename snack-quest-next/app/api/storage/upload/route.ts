import { storageService } from '@/services/storageService';
import { StorageUploadError, StorageValidationError } from '@/lib/storage/errors';
import { STORAGE_DIRECTORIES, isStorageDirectory } from '@/lib/storage/policies';

/**
 * The real upload wire for `services/storageService.ts` (§ Vercel
 * Blob migration's "Upload Flow": receive the file → validate → hand
 * to Vercel Blob → return the Blob URL). Multipart/form-data in, JSON
 * out — deliberately not saving the returned URL into any Firestore
 * document itself; the caller (a future product/creator-content
 * Service) owns that write, same Repository/Service boundary as
 * everywhere else.
 *
 * Honest gap, not silently assumed away: like the internal
 * agent-pricing route, this codebase has no staff/creator session
 * auth wired into API routes yet, so this endpoint accepts any
 * caller. Directory/MIME/size validation still applies to every
 * request — it isn't wide open to arbitrary data, just not yet scoped
 * to "which caller may upload to which business/directory." Add that
 * check here once session auth reaches Route Handlers.
 */
export async function POST(request: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'Expected multipart/form-data.' }, { status: 400 });
  }

  const file = formData.get('file');
  const directory = formData.get('directory');
  const businessId = formData.get('businessId');

  if (!(file instanceof File)) {
    return Response.json({ error: '"file" is required.' }, { status: 400 });
  }
  if (typeof directory !== 'string' || !isStorageDirectory(directory)) {
    return Response.json(
      { error: `"directory" must be one of: ${STORAGE_DIRECTORIES.join(', ')}.` },
      { status: 400 },
    );
  }
  if (typeof businessId !== 'string' || businessId.length === 0) {
    return Response.json({ error: '"businessId" is required.' }, { status: 400 });
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
