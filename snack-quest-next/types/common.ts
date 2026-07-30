import type { Timestamp } from 'firebase/firestore';

/** TDD §7 roles table. */
export type Role = 'customer' | 'creator' | 'admin' | 'super_admin';

/**
 * Audit fields present on every document per TDD §8's design principles:
 * server timestamps only (never client-supplied), soft delete via
 * deletedAt, actor tracking via createdBy/updatedBy ('system' for
 * automated writes).
 */
export interface AuditFields {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  updatedBy: string;
  deletedAt: Timestamp | null;
}

/** A Firestore document's data plus its document ID. */
export type WithId<T> = T & { id: string };
