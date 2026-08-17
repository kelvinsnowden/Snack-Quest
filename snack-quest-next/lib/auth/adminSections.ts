import type { StaffSession } from '@/services/staffAuthService';

/**
 * Per-workspace access control within the Admin Portal (§ Staff access
 * control) — the real answer to "what can this staff member actually
 * access", which until now only existed at the `role` level (an
 * `admin`/`super_admin` got literally everything, no way to narrow it).
 * `department` on `StaffProfile` was never an access boundary, just a
 * label — this is the first thing that actually is one.
 *
 * `'staff'` (managing other staff accounts) is deliberately not a
 * section here — it stays exactly what it already was, a
 * `super_admin`-only page (`isSuperAdmin`/`app/admin/(protected)/staff`),
 * never toggleable. Letting a restricted admin grant themselves more
 * access via Staff would make the whole restriction pointless.
 *
 * Deliberately no `import 'server-only'` — everything here is plain
 * data and pure functions (the one type import is erased at compile
 * time), and it's imported from both sides: Server Components
 * (`requireAdminSection`, the admin layout) and the Client Components
 * that render the section checkboxes in the Staff page
 * (`InviteStaffDialog`, `StaffTable`). The Next-bound imperative
 * version a page's layout calls lives separately, and only there, in
 * `lib/auth/requireAdminSection.ts`.
 */
export type AdminSection = 'orders' | 'finance' | 'marketing' | 'conversations' | 'operations';

export interface AdminSectionMeta {
  key: AdminSection;
  label: string;
  description: string;
}

export const ADMIN_SECTIONS: AdminSectionMeta[] = [
  {
    key: 'orders',
    label: 'Orders & Fulfillment',
    description: 'Orders, products, inventory, purchase orders, fulfillment batches, suppliers, deliveries, and delivery zones.',
  },
  {
    key: 'finance',
    label: 'Finance',
    description: 'Creator withdrawals and payment reconciliation.',
  },
  {
    key: 'marketing',
    label: 'Customers & Marketing',
    description: 'Customers, creators, campaigns, referrals, marketing emails, notification templates, reviews, and FAQ.',
  },
  {
    key: 'conversations',
    label: 'Conversations',
    description: 'WhatsApp conversation transcripts.',
  },
  {
    key: 'operations',
    label: 'Operations & System',
    description: 'Operations dashboard, audit logs, storage, and settings.',
  },
];

export const ADMIN_SECTION_KEYS: readonly AdminSection[] = ADMIN_SECTIONS.map((s) => s.key);

export function isAdminSection(value: string): value is AdminSection {
  return (ADMIN_SECTION_KEYS as readonly string[]).includes(value);
}

/**
 * Whether `session` can reach `section`. `super_admin` always can. An
 * empty `permissions` array is *unrestricted* — the value every
 * existing account already has (see `StaffManagementService.inviteStaff`'s
 * old always-`[]` default) — so shipping this never silently locks
 * anyone out of a section they could already reach; a super_admin has
 * to actively check boxes to narrow someone from "everything" down to
 * "only this."
 */
export function canAccessAdminSection(session: Pick<StaffSession, 'roles' | 'permissions'>, section: AdminSection): boolean {
  if (session.roles.includes('super_admin')) {
    return true;
  }
  if (session.permissions.length === 0) {
    return true;
  }
  return session.permissions.includes(section);
}

/** The sections a session can reach, for filtering nav — `null` means unrestricted (show everything), never an array of all five (that would silently go stale the day a sixth section is added). */
export function visibleAdminSections(session: Pick<StaffSession, 'roles' | 'permissions'>): AdminSection[] | null {
  if (session.roles.includes('super_admin') || session.permissions.length === 0) {
    return null;
  }
  return ADMIN_SECTION_KEYS.filter((key) => session.permissions.includes(key));
}
