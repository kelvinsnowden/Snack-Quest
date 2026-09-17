/**
 * The known, code-gated feature flags (§ Phase 6: Feature flags) —
 * every flag an admin can see or toggle must appear here first, same
 * discipline as `INTEGRATION_FIELD_MANIFEST` (§ Integration Portal):
 * a flag key nothing in code actually checks would be a dead toggle,
 * and a flag checked in code but missing here would be invisible to
 * the admin who needs to turn it off. `defaultEnabled` is what a
 * business gets before it has ever explicitly set the flag — chosen
 * per flag to match the feature's actual current behavior, so adding
 * a flag around an existing feature is never itself a breaking change.
 */
export interface FeatureFlagDefinition {
  key: string;
  name: string;
  description: string;
  defaultEnabled: boolean;
}

export const FEATURE_FLAG_CATALOG: readonly FeatureFlagDefinition[] = [
  {
    key: 'customer_balance_command',
    name: 'WhatsApp BALANCE command',
    description: 'Lets a customer text BALANCE or WALLET at any point to check their Quest wallet credit (§ Phase 4).',
    defaultEnabled: true,
  },
  {
    key: 'global_search',
    name: 'Global search',
    description: 'Admin-wide search across orders, customers, products, inventory, suppliers, purchase orders, conversations, and creators (§ Phase 7).',
    defaultEnabled: true,
  },
  {
    key: 'creator_financial_writes_frozen',
    name: 'Freeze creator financial writes',
    description:
      'Temporary maintenance switch for the creatorProfiles → creatorMemberships schema migration — blocks new withdrawal requests/approvals/rejections and referral commission crediting while the production data copy runs, so balances stay consistent during the cutover. Leave off outside of a scheduled migration window.',
    defaultEnabled: false,
  },
  /*
   * The two fast services, each switchable on its own.
   *
   * The clock already withdraws them — same-day at 13:00, express
   * outside 10:00–13:00, both on a Sunday — but the clock only knows
   * the hour, not whether anyone is here to pack. A day off, a courier
   * that has stopped collecting, a team that is out: on any of those
   * the cut-off is irrelevant and the checkout would keep selling a
   * 6pm guarantee at 09:00.
   *
   * Separate flags rather than one "fast delivery" switch because the
   * two are different promises that can fail independently: a full
   * same-day dispatch slot says nothing about whether a rider can be
   * sent out now, and vice versa.
   *
   * Both default on, which is the behaviour before they existed.
   */
  {
    key: 'same_day_delivery',
    name: 'Same-day delivery',
    description:
      'Offers same-day door delivery in the Nairobi metro before the 1pm cut-off. Switch OFF on a day we cannot deliver same-day whatever the hour — the checkout then shows it as unavailable today and the server refuses it, instead of selling an 18:00 guarantee nobody is here to keep.',
    defaultEnabled: true,
  },
  {
    key: 'express_delivery',
    name: 'Express delivery',
    description:
      'Offers 90-minute express door delivery in the Nairobi metro between 10am and 1pm. Switch OFF when there is no rider to dispatch. Independent of same-day: turning one off does not turn off the other.',
    defaultEnabled: true,
  },
  {
    key: 'b2c_disbursements_frozen',
    name: 'Freeze B2C disbursements',
    description:
      'Blocks approving any withdrawal (new or already-pending) via Daraja B2C. Auto-enabled by WithdrawalService the moment a B2C failure is classified as a permanent configuration problem (e.g. an invalid initiator/security credential) — approving again would just hit the identical wall until an operator actually fixes the Daraja B2C credentials in the Integration Portal. Turn this back off manually once that fix is confirmed; it is never cleared automatically.',
    defaultEnabled: false,
  },
] as const;

const CATALOG_BY_KEY = new Map(FEATURE_FLAG_CATALOG.map((flag) => [flag.key, flag]));

export function getFlagDefinition(key: string): FeatureFlagDefinition | undefined {
  return CATALOG_BY_KEY.get(key);
}
