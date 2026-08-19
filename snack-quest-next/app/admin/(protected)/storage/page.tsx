import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { FileText, FolderOpen } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { storageService } from '@/services/storageService';
import {
  STORAGE_DIRECTORIES,
  isStorageDirectory,
  type StorageDirectory,
} from '@/lib/storage/policies';
import { formatBytes } from '@/lib/storage/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { StorageObjectActions } from '@/components/admin/StorageObjectActions';
import { StorageUploadButton } from '@/components/admin/StorageUploadButton';

export const metadata: Metadata = { title: 'Storage' };

const DIRECTORY_LABELS: Record<StorageDirectory, string> = {
  snacks: 'Snacks',
  boxes: 'Boxes',
  creators: 'Creators',
  marketing: 'Marketing',
  orders: 'Orders',
  documents: 'Documents',
  reviews: 'Review photos',
};

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

/** Vercel Blob's `list()` never reports a content type (only `head()`/`put()` do) — the pathname's extension is the only signal available here, and it's real: `sanitizeFilename()` in `storageService.ts` always preserves the original extension. */
function looksLikeImage(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export default async function AdminStoragePage({
  searchParams,
}: {
  searchParams: Promise<{ directory?: string; cursor?: string }>;
}) {
  const session = await requireStaffSession();
  const { directory: rawDirectory, cursor } = await searchParams;
  const directory: StorageDirectory = isStorageDirectory(rawDirectory ?? '')
    ? (rawDirectory as StorageDirectory)
    : 'snacks';

  const { objects, cursor: nextCursor } = await storageService.listFiles(
    session.businessId,
    directory,
    { cursor },
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-page-title text-foreground font-bold tracking-tight">
            Storage
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Upload and browse what&apos;s stored in this business&apos;s Vercel
            Blob storage.
          </p>
        </div>
        <StorageUploadButton directory={directory} />
      </div>

      <Card className="flex flex-wrap gap-2 p-4">
        {STORAGE_DIRECTORIES.map((value) => (
          <Link
            key={value}
            href={`/admin/storage?directory=${value}`}
            className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-medium transition-colors ${
              directory === value
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-border/40'
            }`}
          >
            {DIRECTORY_LABELS[value]}
          </Link>
        ))}
      </Card>

      {objects.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No files here yet"
          description={`Nothing has been uploaded to "${DIRECTORY_LABELS[directory]}" for this business yet.`}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {objects.map((object) => (
            <Card
              key={object.pathname}
              className="flex flex-col gap-2 overflow-hidden p-0"
            >
              <div className="bg-border/10 text-muted-foreground relative flex aspect-square items-center justify-center">
                {looksLikeImage(object.pathname) ? (
                  <Image
                    src={object.url}
                    alt=""
                    fill
                    sizes="200px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <FileText className="size-8" aria-hidden="true" />
                )}
              </div>
              <div className="flex items-center justify-between gap-2 px-3 pb-3">
                <div className="min-w-0">
                  <p
                    className="text-foreground truncate text-xs font-medium"
                    title={object.pathname}
                  >
                    {object.pathname.split('/').pop()}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    {formatBytes(object.size)}
                  </p>
                </div>
                <StorageObjectActions url={object.url} directory={directory} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link
              href={`/admin/storage?directory=${directory}&cursor=${nextCursor}`}
            >
              Load more
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
