import type { Timestamp } from 'firebase/firestore';

/**
 * TDD §7 roles table, extended with the operational staff roles the
 * Admin Portal build-out needs (agent, warehouse, finance — § Admin
 * auth foundation). A `User.roles` array may contain more than one of
 * these (e.g. a staff member who is also a customer), but for staff
 * accounts specifically `StaffProfile.role` (types/staffProfile.ts)
 * is the one primary role that decides which operational workspace
 * they land in.
 */
export type Role =
  | 'customer'
  | 'creator'
  | 'admin'
  | 'super_admin'
  | 'agent'
  | 'warehouse'
  | 'finance';

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
