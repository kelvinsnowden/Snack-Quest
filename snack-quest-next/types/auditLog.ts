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
  /**
   * Which surface initiated this action (§ PART 9 — AUDIT LOG:
   * "source"), e.g. `'admin_portal'`, `'owner_portal'`, `'device'`,
   * `'cron'`. Defaults to `'admin_portal'` at the write boundary
   * (`recordAuditLog`/`auditLogRepository.record`) for every one of
   * this collection's pre-existing call sites, which were all staff
   * acting through the admin UI — never retrofitted, never guessed
   * per record.
   */
  source: string;
  /**
   * The machine this action concerns, when it concerns one
   * (§ PART 9 — AUDIT LOG: "machine") — null for every action that
   * isn't machine-scoped (most of this collection's pre-existing
   * e-commerce/warehouse entries, and still most new ones: a price
   * change on a snack item's global catalogue is real and auditable
   * but touches no one machine in particular).
   */
  machineId: string | null;
  createdAt: Timestamp;
}
