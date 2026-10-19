import type { Timestamp } from 'firebase/firestore';
import type { AuditFields, Role } from './common';

/** `users/{uid}` — identity root, shared by all roles. TDD §8. */
export interface User extends AuditFields {
  email: string;
  roles: Role[];
  displayName: string;
  photoURL: string | null;
  phoneNumber?: string;
  /**
   * Sessions signed in before this moment are refused on their next
   * request (`lib/auth/verifySession.ts`). Set when a staff account is
   * disabled through the app, so it takes effect at once rather than when
   * Firebase Auth is next asked.
   */
  sessionsRevokedAt?: Timestamp | null;
}
