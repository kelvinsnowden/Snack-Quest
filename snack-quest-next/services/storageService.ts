import 'server-only';

import { randomUUID } from 'node:crypto';
import { vercelBlobGateway } from '@/lib/integrations/vercelBlob/vercelBlobGateway';
import {
  STORAGE_DIRECTORY_POLICIES,
  type StorageDirectory,
} from '@/lib/storage/policies';
import { StorageUploadError, StorageValidationError } from '@/lib/storage/errors';
import type { StorageGateway, StorageListPage } from '@/lib/integrations/types';

/**
 * The single storage abstraction the rest of the app talks to (§
 * Vercel Blob migration — "Storage Service" requirement). Every other
 * Service/Route Handler calls THIS, never `lib/integrations/vercelBlob/`
 * or `@vercel/blob` directly — swapping Vercel Blob for another
 * provider later means changing `vercelBlobGateway` (or adding a
 * second `StorageGateway` implementation and picking one here), not
 * touching any caller.
 *
 * Upload flow this implements exactly (spec): validate → upload to
 * Vercel Blob → return the Blob URL. Saving that URL into a Firestore
 * document is deliberately NOT this Service's job — it doesn't know
 * about `packages`, `creatorProfiles`, or any other schema; the
 * calling Service (e.g. a future `PackageService.setImage()`) owns
 * writing the URL into its own document, same Repository/Service
 * boundary as everywhere else in this codebase.
 */

export interface UploadFileInput {
  /** Tenant scoping for the object's path — this is shared, platform-wide storage, not per-business Firestore data, so path-scoping is how one business's uploads stay organized apart from another's. */
  businessId: string;
  directory: StorageDirectory;
  /** Original filename, used only to build a readable pathname — never trusted for its extension/type. */
  filename: string;
  data: Buffer;
  contentType: string;
}

export interface ReplaceFileInput {
  businessId: string;
  directory: StorageDirectory;
  /** The Blob URL a Firestore document already has stored — replaceFile() keeps it identical so no document write is needed after. */
  existingUrl: string;
  data: Buffer;
  contentType: string;
}

export interface UploadedFile {
  url: string;
  pathname: string;
  contentType: string;
  size: number;
}

// Magic-byte signatures for the file types this app actually accepts —
// defense against a spoofed Content-Type header, not a full file-type
// sniffer. Video containers aren't checked (their signatures are much
// more varied); a mismatched video Content-Type still only reaches
// whatever MIME the directory policy already allows.
const MAGIC_BYTES: { contentType: string; check: (bytes: Uint8Array) => boolean }[] = [
  { contentType: 'image/jpeg', check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    contentType: 'image/png',
    check: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    contentType: 'image/gif',
    check: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  },
  {
    contentType: 'image/webp',
    check: (b) =>
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
  {
    contentType: 'application/pdf',
    check: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  },
];

function sanitizeFilename(filename: string): string {
  const base = filename.trim().split(/[/\\]/).pop() || 'file';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '-');
  return cleaned.slice(-120) || 'file';
}

function buildPathname(
  businessId: string,
  directory: StorageDirectory,
  filename: string,
): string {
  return `${directory}/${businessId}/${randomUUID()}-${sanitizeFilename(filename)}`;
}

class StorageService {
  constructor(private readonly gateway: StorageGateway = vercelBlobGateway) {}

  private validate(directory: StorageDirectory, contentType: string, data: Buffer): void {
    if (data.byteLength === 0) {
      throw new StorageValidationError('File is empty.');
    }

    const policy = STORAGE_DIRECTORY_POLICIES[directory];
    if (!policy.allowedMimeTypes.includes(contentType)) {
      throw new StorageValidationError(
        `"${contentType}" isn't an allowed file type for "${directory}". Allowed: ${policy.allowedMimeTypes.join(', ')}.`,
      );
    }
    if (data.byteLength > policy.maxSizeBytes) {
      const maxMb = (policy.maxSizeBytes / (1024 * 1024)).toFixed(0);
      throw new StorageValidationError(
        `File is too large — the limit for "${directory}" is ${maxMb}MB.`,
      );
    }

    const signature = MAGIC_BYTES.find((entry) => entry.contentType === contentType);
    if (signature && !signature.check(data)) {
      throw new StorageValidationError(
        `File content doesn't match its declared type (${contentType}). The upload may be corrupted or mislabeled.`,
      );
    }
  }

  /** validate → upload to Vercel Blob → return the Blob URL, exactly the spec's upload flow. */
  async uploadFile(input: UploadFileInput): Promise<UploadedFile> {
    this.validate(input.directory, input.contentType, input.data);
    const pathname = buildPathname(input.businessId, input.directory, input.filename);

    try {
      return await this.gateway.uploadFile({
        pathname,
        data: input.data,
        contentType: input.contentType,
      });
    } catch (error) {
      if (error instanceof StorageValidationError) {
        throw error;
      }
      throw new StorageUploadError(
        `Upload failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  /** Same URL, new contents — for "swap this snack's photo" style edits, so the caller's Firestore document never needs a follow-up write. */
  async replaceFile(input: ReplaceFileInput): Promise<UploadedFile> {
    this.validate(input.directory, input.contentType, input.data);
    const pathname = new URL(input.existingUrl).pathname.replace(/^\//, '');

    try {
      return await this.gateway.uploadFile({
        pathname,
        data: input.data,
        contentType: input.contentType,
        allowOverwrite: true,
      });
    } catch (error) {
      if (error instanceof StorageValidationError) {
        throw error;
      }
      throw new StorageUploadError(
        `Replace failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async deleteFile(url: string): Promise<void> {
    try {
      await this.gateway.deleteFile(url);
    } catch (error) {
      throw new StorageUploadError(
        `Delete failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  /** Confirms/retrieves the public URL for an already-uploaded object — a real Vercel Blob lookup, never a guessed/templated hostname. */
  async generatePublicUrl(urlOrPathname: string): Promise<string> {
    const metadata = await this.gateway.getMetadata(urlOrPathname);
    return metadata.url;
  }

  /** § Admin: Storage browser — lists what's actually in a business's directory, scoped by the same `{directory}/{businessId}/` prefix `buildPathname()` uploads under. */
  async listFiles(
    businessId: string,
    directory: StorageDirectory,
    options: { cursor?: string; limit?: number } = {},
  ): Promise<StorageListPage> {
    return this.gateway.listFiles({
      prefix: `${directory}/${businessId}/`,
      cursor: options.cursor,
      limit: options.limit,
    });
  }
}

export const storageService = new StorageService();
export { StorageService };
