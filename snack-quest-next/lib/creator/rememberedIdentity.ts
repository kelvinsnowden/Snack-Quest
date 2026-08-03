'use client';

import { useSyncExternalStore } from 'react';

/**
 * "Welcome back, {name}" on the login screen (§ Creator Portal
 * premium rebuild, reference-image quality pass) — remembers the
 * display name and email of whoever last signed in successfully *on
 * this device*, nothing more. No tokens, no server round-trip: this
 * is purely a client-side convenience cache, written the moment a
 * real login or registration succeeds and read back the next time the
 * login page mounts. A creator who never signed in here sees the
 * plain default copy, exactly as before — the personalization is only
 * ever a genuine echo of a real prior session, never a guess.
 *
 * `useRememberedCreator` is a real external store, not a one-shot
 * cache: App Router navigation is client-side, so the module instance
 * (and any naively memoized "first read") survives across route
 * changes within one tab. Log in, log out, and land back on this page
 * without a hard reload, and a cache that only ever read localStorage
 * once would still show the pre-login state. `getSnapshot` instead
 * re-reads the raw string every call (cheap) and only re-parses when
 * it actually changed, and `rememberCreator`/`forgetRememberedCreator`
 * notify subscribers directly — the same shape `useSyncExternalStore`
 * expects from any real external store.
 */

const STORAGE_KEY = 'sq_creator_returning';

export interface RememberedCreator {
  displayName: string;
  email: string;
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parseIdentity(raw: string | null): RememberedCreator | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as RememberedCreator).displayName === 'string' &&
      typeof (parsed as RememberedCreator).email === 'string'
    ) {
      return parsed as RememberedCreator;
    }
  } catch {
    // Malformed JSON — treat exactly like "nothing remembered".
  }
  return null;
}

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function rememberCreator(identity: RememberedCreator): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Storage can be unavailable (private browsing, quota) — personalization just doesn't happen next time.
  }
  notify();
}

export function getRememberedCreator(): RememberedCreator | null {
  return parseIdentity(readRaw());
}

export function forgetRememberedCreator(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage never worked in the first place.
  }
  notify();
}

// `useSyncExternalStore` requires `getSnapshot` to return a referentially
// stable value when nothing changed — comparing the cheap raw string
// (rather than re-parsing and returning a new object every render) gives
// that for free without a stale one-shot cache.
let lastRaw: string | null | undefined;
let lastValue: RememberedCreator | null = null;

function getSnapshot(): RememberedCreator | null {
  const raw = readRaw();
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastValue = parseIdentity(raw);
  }
  return lastValue;
}

/** Server never has localStorage — the client's first render must match this exactly, then `useSyncExternalStore` swaps in the real value right after hydration commits. */
function getServerSnapshot(): RememberedCreator | null {
  return null;
}

export function useRememberedCreator(): RememberedCreator | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
