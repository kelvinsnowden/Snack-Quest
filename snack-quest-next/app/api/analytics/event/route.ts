import { parseCookie } from 'cookie';
import { analyticsEventService, AnalyticsEventValidationError } from '@/services/analyticsEventService';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { VISITOR_COOKIE } from '@/lib/analytics/cookies';

/**
 * `POST /api/analytics/event` (§ exit-intent rescue offer) — where the
 * rescue-offer popup's client-side beacons land. Sibling to
 * `POST /api/analytics/track`, not a replacement: that route is
 * `PageViewTracker`'s "what page is this" beacon, this one is "what
 * did the visitor just do". Same public/unauthenticated posture, same
 * `VISITOR_COOKIE` identity (read-only here — the page-view route owns
 * setting it, since it always fires first on any real page load).
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { event, metadata } = (body ?? {}) as {
    event?: unknown;
    metadata?: unknown;
  };
  if (typeof event !== 'string') {
    return Response.json({ error: 'body must include a string "event"' }, { status: 400 });
  }
  if (metadata !== undefined && metadata !== null && (typeof metadata !== 'object' || Array.isArray(metadata))) {
    return Response.json({ error: '"metadata" must be an object when provided' }, { status: 400 });
  }

  const cookieHeader = request.headers.get('cookie');
  const visitorId = cookieHeader ? (parseCookie(cookieHeader)[VISITOR_COOKIE] ?? null) : null;

  try {
    await analyticsEventService.record(getCurrentBusinessId(), {
      event,
      visitorId,
      metadata: (metadata as Record<string, string | number | boolean> | null | undefined) ?? null,
    });
  } catch (error) {
    if (error instanceof AnalyticsEventValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  return new Response(null, { status: 204 });
}
