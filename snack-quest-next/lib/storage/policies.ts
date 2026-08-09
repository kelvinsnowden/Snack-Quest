/**
 * What's allowed in each storage directory (§ Vercel Blob migration).
 * Pure data/config, no I/O — mirrors `lib/delivery/providers.ts`'
 * registry pattern: adding a new directory or loosening a MIME
 * allowlist is an edit here, never a change to `StorageService` or any
 * caller. Every directory the "Storage Organization" spec named is
 * represented; nothing here assumes images are the only file type —
 * `documents`/`orders` already carry PDFs, and any directory can grow
 * a new allowed type without a schema/architecture change.
 */

export const STORAGE_DIRECTORIES = [
  'snacks',
  'boxes',
  'creators',
  'marketing',
  'orders',
  'documents',
  'reviews',
] as const;

export type StorageDirectory = (typeof STORAGE_DIRECTORIES)[number];

export function isStorageDirectory(value: string): value is StorageDirectory {
  return (STORAGE_DIRECTORIES as readonly string[]).includes(value);
}

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const DOCUMENT_MIME_TYPES = ['application/pdf'];

export interface StorageDirectoryPolicy {
  allowedMimeTypes: string[];
  maxSizeBytes: number;
}

const MB = 1024 * 1024;

/**
 * `creators` and `marketing` allow video (creator content, marketing
 * creatives) — everything else is images-or-documents only, matching
 * what each directory is actually for per the spec. `orders` allows
 * both: a delivery photo and a PDF receipt are both plausible order
 * attachments.
 */
export const STORAGE_DIRECTORY_POLICIES: Record<StorageDirectory, StorageDirectoryPolicy> = {
  snacks: { allowedMimeTypes: IMAGE_MIME_TYPES, maxSizeBytes: 8 * MB },
  boxes: { allowedMimeTypes: IMAGE_MIME_TYPES, maxSizeBytes: 8 * MB },
  marketing: {
    allowedMimeTypes: [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES],
    maxSizeBytes: 100 * MB,
  },
  creators: {
    allowedMimeTypes: [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES],
    maxSizeBytes: 100 * MB,
  },
  orders: {
    allowedMimeTypes: [...IMAGE_MIME_TYPES, ...DOCUMENT_MIME_TYPES],
    maxSizeBytes: 10 * MB,
  },
  documents: { allowedMimeTypes: DOCUMENT_MIME_TYPES, maxSizeBytes: 20 * MB },
  // The only directory an unauthenticated member of the public can
  // write into (§ homepage reviews), so it is the tightest: images
  // only, and small enough that a phone photo goes through while a
  // deliberately oversized payload doesn't. `StorageService` also
  // magic-byte checks every one of these types, so a renamed
  // executable claiming to be a JPEG is rejected before upload.
  reviews: { allowedMimeTypes: IMAGE_MIME_TYPES, maxSizeBytes: 6 * MB },
};

/**
 * Review video is deliberately NOT part of `reviews` above.
 *
 * Everything in that policy travels through `POST /api/reviews` in the
 * same request as the text, and Vercel caps a function's request body
 * at 4.5MB — the limit that silently rejected photo uploads until they
 * were compressed in the browser. A phone video is 10-100MB, so it
 * cannot use that path at all: the browser uploads it straight to Blob
 * storage and only the resulting URL comes back through us.
 *
 * That makes it a different trust problem, not just a bigger file. A
 * public endpoint handing out upload tokens is a file host unless it
 * is fenced, so the fence lives here: these types only, this ceiling,
 * and nothing else in the app may widen it.
 *
 * 50MB is roughly 30 seconds of phone video at typical bitrates. The
 * form asks for 30 seconds and enforces the duration itself; this is
 * the backstop for anything that gets past it.
 */
export const REVIEW_VIDEO_POLICY = {
  allowedMimeTypes: VIDEO_MIME_TYPES,
  maxSizeBytes: 50 * MB,
  maxDurationSeconds: 30,
} as const;
