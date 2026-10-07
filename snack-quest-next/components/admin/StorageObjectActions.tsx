'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StorageDirectory } from '@/lib/storage/policies';

export function StorageObjectActions({ url, directory }: { url: string; directory: StorageDirectory }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    if (!window.confirm('Delete this file? This cannot be undone.')) {
      return;
    }
    setDeleting(true);
    try {
      const response = await fetch('/api/admin/storage', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, directory }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not delete this file.');
      }
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not delete this file.');
      setDeleting(false);
    }
  }

  // `?download=1` is Vercel Blob's own switch for serving a file as an
  // attachment (it is what the SDK's `downloadUrl` is). The `download`
  // attribute alone does nothing here: browsers ignore it cross-origin,
  // so an image would just open in the tab instead of saving.
  const downloadUrl = new URL(url);
  downloadUrl.searchParams.set('download', '1');

  return (
    <div className="flex shrink-0 items-center">
      <Button asChild variant="ghost" size="sm" aria-label="Download file">
        <a href={downloadUrl.toString()} download>
          <Download className="size-4" aria-hidden="true" />
        </a>
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDelete} loading={deleting} aria-label="Delete file">
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
