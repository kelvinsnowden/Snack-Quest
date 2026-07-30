import type { Timestamp } from 'firebase/firestore';

/**
 * `auditLogs/{logId}` — immutable staff-action trail. TDD §8. Write-only
 * from server (rules §9), never updated or deleted.
 */
export interface AuditLog {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ipAddress: string;
  createdAt: Timestamp;
}
