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
   * The Firebase Auth uid of the person who claimed this partner's
   * Owner Portal login (§ PART 2 — OWNER PORTAL, § partner
   * authentication). Null until claimed — a partner is always
   * created by staff first (with `contactEmail`), then claims its own
   * login by registering with that same email, exactly mirroring
   * `services/creatorAuthService.register()`'s own "the real account
   * is Firebase Auth; the role-granting link only gets written here"
   * pattern. At most one partner can ever hold a given uid — see
   * `partnerRepository.findByAuthUid`.
   */
  authUid: string | null;
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
