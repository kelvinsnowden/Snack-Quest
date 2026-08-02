import 'server-only';

import { auditLogRepository } from '@/repositories/auditLogRepository';

/**
 * The requester's IP, best-effort — `Request` has no direct IP accessor
 * (Next.js Route Handlers run behind Vercel's proxy), so `x-forwarded-for`
 * is the real signal; `'unknown'` is an honest fallback for local/test
 * requests that never pass through a proxy, never a fabricated address.
 */
export function clientIpFrom(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export interface AuditLogEntryInput {
  businessId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/**
 * Records a staff-action audit entry (§ Admin: Audit Logs). Deliberately
 * a Route-layer helper, not a Service call: IP address is an HTTP-request
 * concern the Service layer never sees, and every caller here already has
 * everything else (actor, before/after) in hand right after its own
 * Service call succeeds.
 */
export async function recordAuditLog(request: Request, entry: AuditLogEntryInput): Promise<void> {
  await auditLogRepository.record({
    businessId: entry.businessId,
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ipAddress: clientIpFrom(request),
  });
}
