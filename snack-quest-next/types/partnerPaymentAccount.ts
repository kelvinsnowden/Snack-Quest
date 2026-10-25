import type { Timestamp } from 'firebase/firestore';

/**
 * `partnerPaymentAccounts/{accountId}` — one of a machine owner's own M-Pesa
 * tills or paybills, connected from their portal. An owner may connect
 * several and choose, machine by machine, which one its sales are paid
 * into (`machineIds`); a machine is in at most one owner's till at a time.
 *
 * The three Daraja keys are encrypted at rest when `SECRET_ENCRYPTION_KEY`
 * is set (`lib/secrets/secretCipher`) and never sent back to a browser.
 * The security rule denies every client read and write; the Admin SDK is
 * the only reader and writer.
 *
 * Sales only go to an owner's till on a machine whose agreement is on
 * invoice billing (`CommercialTerms.ownerBilling: 'invoice'`): Snack Quest
 * doesn't hold that money, so it is paid for stock and the fee by invoice
 * rather than out of settlement.
 */
export type PartnerPaymentAccountType = 'till' | 'paybill';

/** `connected`: Safaricom accepted the keys at the last check, and sales may use it. `failed`: they didn't; its machines' sales go to Snack Quest's account. */
export type PartnerPaymentAccountStatus = 'connected' | 'failed';

export interface PartnerPaymentAccount {
  businessId: string;
  partnerId: string;
  accountType: PartnerPaymentAccountType;
  /** The till or paybill the money goes to (`PartyB`). */
  shortcode: string;
  /** A till's store or head-office number — the one the Daraja app and passkey are for (`BusinessShortCode`). Null when it is the same number. */
  headOfficeShortcode: string | null;
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
  /** The owner's machines whose sales are paid into this till. */
  machineIds: string[];
  status: PartnerPaymentAccountStatus;
  /** What Safaricom said was wrong at the last check, in words the owner can act on. */
  lastError: string | null;
  /** What to do about it. */
  lastErrorDetail: string | null;
  lastCheckedAtMs: number;
  connectedAtMs: number | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** What the owner's browser may see: never a key, only that one is saved and its last four characters. */
export interface PartnerPaymentAccountView {
  id: string;
  accountType: PartnerPaymentAccountType;
  shortcode: string;
  headOfficeShortcode: string | null;
  machineIds: string[];
  status: PartnerPaymentAccountStatus;
  lastError: string | null;
  lastErrorDetail: string | null;
  lastCheckedAtMs: number;
  connectedAtMs: number | null;
  consumerKeyEnding: string;
}
