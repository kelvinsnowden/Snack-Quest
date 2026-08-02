import type { Timestamp } from 'firebase/firestore';

/**
 * `auditLogs/{logId}` — immutable staff-action trail. TDD §8. Write-only
 * from server (rules §9), never updated or deleted.
 *
 * `businessId` isn't in the original TDD §8 shape — added here for the
 * same reason every other collection carries it (§ multi-tenant
 * retrofit): `firestore.rules`' `isAdmin()` is still platform-wide (see
 * that file's multi-tenancy note), but every Service still scopes its
 * own queries by business so one tenant's admin never sees another's
 * staff-action trail.
 */
export interface AuditLog {
  businessId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ipAddress: string;
  createdAt: Timestamp;
}
