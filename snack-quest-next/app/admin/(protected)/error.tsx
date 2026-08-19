'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The Admin Portal's error boundary (§ Admin mobile UX overhaul).
 *
 * There was none before, so any page whose server-side read threw
 * rendered Next's own error screen — a dead page with no way back and
 * nothing to act on. That is how a missing Firestore composite index
 * showed up in production: `/admin/creators` loaded, `?status=active`
 * did not, and the page gave no clue why.
 *
 * Staff are the only audience here, so this says more than a customer
 * page would. A missing-index failure in particular is recognised and
 * named, because it is the one failure mode that is invisible in local
 * development (the emulator builds indexes on demand; production does
 * not) and always has the same fix — deploy the index definitions.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server already logs the real stack; this puts it in the
    // browser console too, so whoever is looking at the broken page has
    // it in front of them.
    console.error('Admin page failed to render:', error);
  }, [error]);

  const message = error.message ?? '';
  const isMissingIndex =
    message.includes('FAILED_PRECONDITION') ||
    message.includes('requires an index') ||
    message.includes('The query requires an index');

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-6 py-12 text-center">
      <span className="bg-danger/10 text-danger flex size-14 items-center justify-center rounded-full">
        <AlertCircle className="size-7" aria-hidden="true" />
      </span>

      <div>
        <h1 className="text-foreground text-xl font-semibold tracking-tight">
          {isMissingIndex ? 'This view needs a database index' : 'This page could not load'}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm text-pretty">
          {isMissingIndex ? (
            <>
              The filter you selected needs a Firestore composite index that has not been deployed
              yet. The definitions live in <code className="text-foreground">firestore.indexes.json</code>;
              deploying them with{' '}
              <code className="text-foreground">firebase deploy --only firestore:indexes</code> fixes
              this. Other filters on this page may still work in the meantime.
            </>
          ) : (
            'Something went wrong while loading this page. Trying again often works — if it keeps happening, the details are in the browser console and the server logs.'
          )}
        </p>
        {error.digest ? (
          <p className="text-muted-foreground mt-3 font-mono text-xs">Reference: {error.digest}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" onClick={reset}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
