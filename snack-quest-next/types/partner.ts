import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

/**
 * `partners/{partnerId}` — the tenant a machine owner/investor belongs
 * to (§ multi-machine partner architecture,
 * docs/FLEET_ARCHITECTURE_AUDIT.md §6/§15).
 *
 * One partner, many machines, one account — `Machine.ownerPartnerId`
 * points here. Deliberately not a role on `staffProfiles`: a partner
 * is not an employee and has no Admin Portal access. Its own login
 * (§ PART 2 — OWNER PORTAL, `services/partnerAuthService.ts`) is a
 * separate Firebase Auth-backed session, the same pattern
 * `creatorAuthService` already proved, claimed via `authUid` rather
 * than granted a `staffProfiles` role — see
 * `docs/VENDING_FOUNDATION.md`'s RBAC section for the full picture.
 * This collection and `machineService`'s partner-scoped reads are the
 * enforcement primitive that real partner session now sits on top of.
 */
export type PartnerStatus = 'active' | 'suspended';

export interface Partner extends AuditFields {
  businessId: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  status: PartnerStatus;
  note: string | null;
  /**
   * The Firebase Auth uid of this owner's Owner Portal login (§ PART 2 —
   * OWNER PORTAL, § partner authentication). Null until Snack Quest sends
   * them their login email: `partnerPortalAccessService` sets up the login
   * for `contactEmail` and links it here, and the owner creates its password
   * from the emailed link. At most one partner can ever hold a given uid —
   * see `partnerRepository.findByAuthUid`.
   */
  authUid: string | null;
  /** When Snack Quest last emailed them a link to set their Owner Portal password. Absent until the first one. */
  portalInviteSentAt?: Timestamp | null;
  /**
   * Mirrors `CreatorProfile.availableCashKes`/`CustomerWallet.balanceKes`
   * exactly (§ OWNER WALLET, docs/MACHINE_COMMERCE.md §6) — a cached,
   * incrementally-maintained total; `PartnerEarningsLedgerEntry` is the
   * append-only source of truth it's derived from. Credited only by
   * `MachineSettlementService.finalize()`; debited (reserved) only by
   * `WithdrawalService.requestWithdrawal()` via
   * `partnerRepository.reserveBalanceInTransaction`.
   */
  availableCashKes: number;
  /** Never decremented — the running total of everything ever credited, independent of withdrawals. */
  lifetimeEarnedKes: number;
}
