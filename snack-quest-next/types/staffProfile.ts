import type { AuditFields } from './common';

export type StaffRole = 'admin' | 'super_admin';

/** `staffProfiles/{uid}` — staff-specific data. TDD §8. */
export interface StaffProfile extends AuditFields {
  role: StaffRole;
  permissions: string[];
  department: string;
}
