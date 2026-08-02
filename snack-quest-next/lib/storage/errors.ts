/**
 * User-facing storage errors (§ Vercel Blob migration). Kept distinct
 * from the raw Gateway/SDK error so callers (API routes, and
 * eventually upload UI) can show a message a customer or creator can
 * actually act on, instead of a Vercel Blob SDK error string.
 */

export class StorageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageValidationError';
  }
}

export class StorageUploadError extends Error {
  constructor(message = 'The file could not be uploaded. Please try again.') {
    super(message);
    this.name = 'StorageUploadError';
  }
}
