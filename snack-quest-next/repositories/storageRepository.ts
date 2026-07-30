import 'server-only';

import { adminStorage } from '@/lib/firebase/admin';

/**
 * File storage access (TDD §4/§16). Same Repository-layer discipline as
 * every other Repository: persistence only, no business rules, and the
 * only code allowed to touch the Storage SDK directly.
 *
 * Cloud Storage for Firebase cannot be provisioned on the current
 * project's Spark (free) billing plan — enabling it requires an
 * upgrade to Blaze, a business/ops decision made outside this codebase.
 * Until that upgrade happens, `storageRepository` resolves to
 * `UnavailableStorageRepository`, which fails closed with
 * `StorageUnavailableError` instead of silently no-op'ing or crashing
 * with a confusing SDK error. Every Service that needs file storage
 * codes against the `StorageRepository` interface below; flipping
 * `FIREBASE_STORAGE_ENABLED=true` once Blaze is active is the entire
 * migration to the real implementation — no call site changes.
 */

export class StorageUnavailableError extends Error {
  constructor(
    message = 'Firebase Storage is not yet enabled for this project (requires the Blaze billing plan). See TECHNICAL_DESIGN_DOCUMENT.md §16.',
  ) {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

export interface UploadFileInput {
  /** Storage object path, e.g. `campaignSubmissions/{uid}/{submissionId}/{filename}`. */
  path: string;
  data: Buffer | Uint8Array;
  contentType: string;
}

export interface StorageRepository {
  uploadFile(input: UploadFileInput): Promise<{ path: string }>;
  getDownloadUrl(path: string): Promise<string>;
  deleteFile(path: string): Promise<void>;
}

class FirebaseStorageRepository implements StorageRepository {
  async uploadFile({
    path,
    data,
    contentType,
  }: UploadFileInput): Promise<{ path: string }> {
    const file = adminStorage.bucket().file(path);
    await file.save(Buffer.from(data), { contentType });
    return { path };
  }

  async getDownloadUrl(path: string): Promise<string> {
    const file = adminStorage.bucket().file(path);
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    });
    return url;
  }

  async deleteFile(path: string): Promise<void> {
    await adminStorage.bucket().file(path).delete();
  }
}

class UnavailableStorageRepository implements StorageRepository {
  async uploadFile(): Promise<{ path: string }> {
    throw new StorageUnavailableError();
  }

  async getDownloadUrl(): Promise<string> {
    throw new StorageUnavailableError();
  }

  async deleteFile(): Promise<void> {
    throw new StorageUnavailableError();
  }
}

function createStorageRepository(): StorageRepository {
  return process.env.FIREBASE_STORAGE_ENABLED === 'true'
    ? new FirebaseStorageRepository()
    : new UnavailableStorageRepository();
}

export const storageRepository: StorageRepository = createStorageRepository();
