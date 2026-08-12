/**
 * Fire-and-forget client beacon to `POST /api/analytics/event` (§
 * exit-intent rescue offer) — same `keepalive`/best-effort/silent
 * discipline as `PageViewTracker.tsx`'s own beacon: a missed analytics
 * call is a minor accuracy gap, never something a real visitor should
 * see as an error or that should block whatever they were doing (a
 * dialog closing, a navigation).
 */
export function trackEvent(event: string, metadata?: Record<string, string | number | boolean>): void {
  try {
    fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event, metadata: metadata ?? null }),
      keepalive: true,
    }).catch(() => {
      // Nothing to do — see the doc comment above.
    });
  } catch {
    // Nothing to do — see the doc comment above.
  }
}
