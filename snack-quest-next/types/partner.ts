import type { AuditFields } from './common';

/**
 * `partners/{partnerId}` — the tenant a machine owner/investor belongs
 * to (§ multi-machine partner architecture,
 * docs/FLEET_ARCHITECTURE_AUDIT.md §6/§15).
 *
 * One partner, many machines, one account — `Machine.ownerPartnerId`
 * points here. Deliberately not a role on `staffProfiles`: a partner
 * is not an employee, has no Admin Portal access, and (per this
 * pass's own scope) has no login flow built yet — see
 * `docs/VENDING_FOUNDATION.md`'s RBAC section for what is and is not
 * built. This collection and `machineService`'s partner-scoped reads
 * are the enforcement primitive a real partner session will sit on
 * top of once one exists.
 */
export type PartnerStatus = 'active' | 'suspended';

export interface Partner extends AuditFields {
  businessId: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  status: PartnerStatus;
  note: string | null;
}
