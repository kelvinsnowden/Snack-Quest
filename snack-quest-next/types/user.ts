import type { AuditFields, Role } from './common';

/** `users/{uid}` — identity root, shared by all roles. TDD §8. */
export interface User extends AuditFields {
  email: string;
  roles: Role[];
  displayName: string;
  photoURL: string | null;
  phoneNumber?: string;
}
