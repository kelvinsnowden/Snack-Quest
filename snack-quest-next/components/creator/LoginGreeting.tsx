'use client';

import { useRememberedCreator } from '@/lib/creator/rememberedIdentity';

/**
 * Personalized login greeting (§ Creator Portal premium rebuild,
 * reference-image quality pass). `useRememberedCreator` is already
 * hydration-safe (server snapshot is always `null`), so this renders
 * the generic default on the server and on the client's first paint,
 * then swaps to the personalized version the moment React commits the
 * real localStorage value — no flash of the wrong copy for a
 * first-time visitor, who simply has nothing remembered.
 */
export function LoginGreetingTitle() {
  const remembered = useRememberedCreator();
  return remembered ? <>Welcome back, {remembered.displayName.split(' ')[0]}</> : <>Creators</>;
}

export function LoginGreetingSubtitle() {
  const remembered = useRememberedCreator();
  return remembered ? (
    <>Sign in to pick up where you left off.</>
  ) : (
    <>Sign in to your creator account to continue.</>
  );
}
