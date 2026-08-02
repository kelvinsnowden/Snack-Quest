'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
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

  return (
    <Button type="button" variant="ghost" size="sm" onClick={onDelete} loading={deleting} aria-label="Delete file">
      <Trash2 className="size-4" aria-hidden="true" />
    </Button>
  );
}
