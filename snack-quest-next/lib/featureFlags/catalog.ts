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
