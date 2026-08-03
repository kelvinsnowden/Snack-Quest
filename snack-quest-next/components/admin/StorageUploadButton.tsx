'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  STORAGE_DIRECTORY_POLICIES,
  type StorageDirectory,
} from '@/lib/storage/policies';
import { formatBytes } from '@/lib/storage/format';

/**
 * The upload half of the media library (§ Complete the Admin Portal).
 * `/api/storage/upload` and `storageService.uploadFile` already worked
 * — this page could browse and delete but had no way to add a file,
 * which is not a media library, it's a read-only viewer with a trash
 * can. Reuses the exact route `ProductForm` already calls, so this is
 * wiring, not new backend.
 *
 * `accept` is built from the current directory's real policy
 * (`STORAGE_DIRECTORY_POLICIES`) rather than hardcoded, so the file
 * picker only offers what the server will actually accept — e.g.
 * `documents` shows PDFs only, `creators` shows images and video. The
 * size cap is enforced client-side too, so a 200MB video is rejected
 * before it spends a minute uploading only to 400 at the end.
 */
export function StorageUploadButton({
  directory,
}: {
  directory: StorageDirectory;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const policy = STORAGE_DIRECTORY_POLICIES[directory];

  async function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    if (!policy.allowedMimeTypes.includes(file.type)) {
      setError(`"${file.name}" isn't a supported file type for this folder.`);
      return;
    }
    if (file.size > policy.maxSizeBytes) {
      setError(
        `"${file.name}" is ${formatBytes(file.size)} — the limit here is ${formatBytes(policy.maxSizeBytes)}.`,
      );
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('directory', directory);
      const response = await fetch('/api/storage/upload', {
        method: 'POST',
        body: form,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? 'Upload failed.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        type="button"
        onClick={() => inputRef.current?.click()}
        loading={uploading}
      >
        <Upload className="size-4" aria-hidden="true" />
        Upload
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={policy.allowedMimeTypes.join(',')}
        onChange={onFileSelected}
        className="sr-only"
        aria-label={`Upload a file to ${directory}`}
      />
      {error ? (
        <p
          role="alert"
          className="text-caption text-danger max-w-xs text-right"
        >
          {error}
        </p>
      ) : (
        <p className="text-caption text-muted-foreground">
          Up to {formatBytes(policy.maxSizeBytes)}
        </p>
      )}
    </div>
  );
}
