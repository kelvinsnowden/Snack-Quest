import 'server-only';

import type { StaffSession } from '@/services/staffAuthService';
import type { Role } from '@/types';

/**
 * § Security audit — every `/api/admin/**` route previously checked
 * only that *some* valid staff session existed
 * (`verifyStaffSessionFromRequest`), never which role it held. The
 * Admin Portal's own page layout (`app/admin/(protected)/layout.tsx`)
 * already redirects an `agent`/`warehouse`/`finance`-only session away
 * from every `/admin/*` page it doesn't own — but a Route Handler is
 * reachable with nothing but a valid cookie regardless of what the UI
 * shows or redirects, so that page-level gate was never a real
 * authorization boundary for the routes themselves. This is that
 * boundary, enforced where it actually matters.
 *
 * `allowedRoles` is deliberately the *smallest* set that matches real,
 * current UI usage, verified per call site by tracing which
 * component actually calls it — not a guess at what a role "should"
 * reasonably be allowed to do:
 * - `ADMIN_ONLY`: the default for everything with no evidence any
 *   lower-privilege workspace's own UI calls it.
 * - `ADMIN_OR_AGENT`: the conversation-action routes
 *   (`ConversationAgentActions`, `ConversationReplyBox`,
 *   `DoorDeliveryPricingForm`) and shipment manual-booking completion
 *   (`CompleteManualBookingDialog`) the Agent workspace's own
 *   conversation detail page renders.
 * - `ADMIN_OR_WAREHOUSE`: `orders/{id}/status`, which
 *   `components/warehouse/MarkDispatchedButton.tsx` — the Warehouse
 *   workspace's one mutation — calls directly.
 */
export function hasStaffRole(
  session: Pick<StaffSession, 'roles'>,
  allowedRoles: readonly Role[],
): boolean {
  return allowedRoles.some((allowed) => session.roles.includes(allowed));
}

export const ADMIN_ONLY: readonly Role[] = ['admin', 'super_admin'];
export const ADMIN_OR_AGENT: readonly Role[] = [
  'admin',
  'super_admin',
  'agent',
];
export const ADMIN_OR_WAREHOUSE: readonly Role[] = [
  'admin',
  'super_admin',
  'warehouse',
];

export function forbiddenResponse(): Response {
  return Response.json({ error: 'forbidden' }, { status: 403 });
}
