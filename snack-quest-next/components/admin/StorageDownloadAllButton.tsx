'use client';

import { useState } from 'react';
import { zipSync } from 'fflate';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StorageListPage } from '@/lib/integrations/types';
import type { StorageDirectory } from '@/lib/storage/policies';

/**
 * Saves every file in one storage folder as a single zip — e.g. every
 * snack image at once, rather than one tile at a time.
 *
 * Built in the browser, not on the server: a Vercel function's response
 * is capped at 4.5MB, and a folder of 8MB-max images passes that with a
 * handful of files. The listing comes from the same `/api/admin/storage`
 * route the page's own data does, followed page by page until Blob says
 * there is no more. Files are stored uncompressed (level 0) because
 * images are already compressed — deflating them again costs time and
 * saves nothing.
 */
export function StorageDownloadAllButton({ directory }: { directory: StorageDirectory }) {
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onDownloadAll() {
    setError(null);
    setProgress('Listing files…');
    try {
      const objects: StorageListPage['objects'] = [];
      let cursor: string | null = null;
      do {
        const params = new URLSearchParams({ directory });
        if (cursor) params.set('cursor', cursor);
        const response = await fetch(`/api/admin/storage?${params}`);
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? 'Could not list the files in this folder.');
        }
        const page = (await response.json()) as StorageListPage;
        objects.push(...page.objects);
        cursor = page.cursor;
      } while (cursor);

      if (objects.length === 0) {
        setError('There are no files in this folder to download.');
        return;
      }

      const files: Record<string, Uint8Array> = {};
      const failed: string[] = [];
      for (const [index, object] of objects.entries()) {
        setProgress(`Fetching ${index + 1} of ${objects.length}…`);
        // `{directory}/{businessId}/name` — the zip only needs the name.
        const name = object.pathname.split('/').slice(2).join('/') || object.pathname;
        try {
          const response = await fetch(object.url);
          if (!response.ok) throw new Error(String(response.status));
          files[name] = new Uint8Array(await response.arrayBuffer());
        } catch {
          failed.push(name);
        }
      }

      if (Object.keys(files).length === 0) {
        throw new Error('None of the files could be fetched.');
      }

      setProgress('Building the zip…');
      const zip = zipSync(files, { level: 0 });
      const href = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
      const link = document.createElement('a');
      link.href = href;
      link.download = `${directory}-${new Date().toISOString().slice(0, 10)}.zip`;
      link.click();
      // Revoked after the click has had a chance to start the download.
      setTimeout(() => URL.revokeObjectURL(href), 10_000);

      if (failed.length > 0) {
        setError(`${failed.length} file(s) could not be fetched and are not in the zip: ${failed.join(', ')}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download this folder.');
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button type="button" variant="outline" onClick={onDownloadAll} loading={progress !== null}>
        <Download className="size-4" aria-hidden="true" />
        Download all
      </Button>
      {error ? (
        <p role="alert" className="text-caption text-danger max-w-xs text-right">
          {error}
        </p>
      ) : progress ? (
        <p aria-live="polite" className="text-caption text-muted-foreground">
          {progress}
        </p>
      ) : null}
    </div>
  );
}
