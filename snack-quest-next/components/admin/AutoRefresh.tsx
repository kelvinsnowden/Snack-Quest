'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Makes a Server Component page feel live by polling `router.refresh()`
 * on a plain interval (§ make /admin/conversations feel live) — the
 * cheapest way to get fresh data onto a page that's otherwise rendered
 * once per request, well short of standing up a websocket/SSE channel
 * this scale doesn't need yet. Renders nothing. Pauses while the tab
 * is hidden so a backgrounded tab doesn't keep re-fetching, and while
 * `pause` is true so a page can suspend polling during e.g. a modal or
 * an in-flight mutation.
 */
export function AutoRefresh({
  intervalMs = 5000,
  pause = false,
}: {
  intervalMs?: number;
  pause?: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (pause) {
      return;
    }
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') {
        router.refresh();
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs, pause]);

  return null;
}
