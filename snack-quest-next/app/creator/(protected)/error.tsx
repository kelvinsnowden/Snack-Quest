'use client';

import { useEffect } from 'react';
import { RotateCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PortalCard } from '@/components/creator/design/PortalCard';

/**
 * Portal error boundary (§ Creator Portal premium rebuild).
 *
 * Covers every screen in the protected group, so a Firestore hiccup
 * renders a recoverable state inside the shell — navigation still
 * works, the creator is not dumped on a blank error page.
 *
 * Distinguishes offline from server-side failure, because the two need
 * different actions from the user and telling someone on a dropped
 * connection that "something went wrong on our end" is simply wrong.
 * `navigator.onLine` is read on the client only, where it exists.
 *
 * The digest is surfaced deliberately: it is the only handle a creator
 * can quote to support that ties their report to a specific server
 * error, and Next hides the message itself in production.
 */
export default function CreatorPortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Creator portal error:', error);
  }, [error]);

  const offline = typeof navigator !== 'undefined' && !navigator.onLine;

  return (
    <div className="mx-auto max-w-md py-12">
      <PortalCard className="text-center">
        <div
          aria-hidden="true"
          className="bg-muted-foreground/10 text-muted-foreground mx-auto flex size-12 items-center justify-center rounded-full"
        >
          {offline ? (
            <WifiOff className="size-6" />
          ) : (
            <RotateCw className="size-6" />
          )}
        </div>

        <h1 className="text-foreground mt-4 text-lg font-semibold">
          {offline ? "You're offline" : "That didn't load"}
        </h1>
        <p className="text-small text-muted-foreground mt-2">
          {offline
            ? 'Check your connection — your earnings and referral data are safe and will be here when you reconnect.'
            : 'Something went wrong on our end. Nothing was lost; trying again usually fixes it.'}
        </p>

        <Button onClick={reset} className="mt-6 w-full sm:w-auto">
          <RotateCw className="size-4" aria-hidden="true" />
          Try again
        </Button>

        {error.digest ? (
          <p className="text-caption text-muted-foreground mt-4">
            Reference <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}
      </PortalCard>
    </div>
  );
}
