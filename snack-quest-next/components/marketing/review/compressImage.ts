/**
 * Shrinks a photo in the browser before it is uploaded (§ homepage
 * reviews).
 *
 * This exists because of a real failure: a customer's review with a
 * photo attached was rejected with a 413 before it ever reached the
 * server. Vercel caps a function's request body at 4.5MB, and a photo
 * straight off a modern phone is routinely 3-8MB — one of them can
 * blow the whole request, and the form allows three.
 *
 * Compressing here rather than raising a limit is the right fix twice
 * over: the request fits, and the homepage isn't asking every visitor
 * to download an 8MB photo to look at a review card that renders it at
 * a few hundred pixels wide.
 *
 * Deliberately dependency-free — canvas re-encoding is a handful of
 * lines and this is the only place in the app that needs it.
 */

/** Comfortably inside a 4.5MB request even with three photos and the form fields. */
export const MAX_TOTAL_UPLOAD_BYTES = 3.6 * 1024 * 1024;

/** Longest edge, in CSS pixels. Larger than any place a review photo is displayed, so nothing visible is lost. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Re-encodes to JPEG at a sane size. Returns the original file
 * untouched if anything goes wrong — a compression failure should cost
 * the customer a photo at worst, never the whole review. The caller
 * still checks the total, so an uncompressed original can't silently
 * push the request over the limit.
 */
export async function compressImage(file: File): Promise<File> {
  try {
    // `from-image` honours EXIF orientation; without it, photos taken
    // in portrait come out rotated once drawn to a canvas.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) {
      // Already smaller than what we'd produce — a screenshot or an
      // already-optimised image. Keep the original rather than
      // re-encoding it worse.
      return file;
    }

    const name = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}

export function totalBytes(files: { size: number }[]): number {
  return files.reduce((sum, file) => sum + file.size, 0);
}
