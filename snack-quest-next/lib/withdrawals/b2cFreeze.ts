import 'server-only';

import { featureFlagService } from '@/services/featureFlagService';

export class B2CDisbursementsFrozenError extends Error {
  constructor() {
    super(
      'B2C disbursements are currently paused for this business — a prior payout failed for a configuration reason that needs an operator to fix before any withdrawal can be approved. Check the Integration Portal, then clear "Freeze B2C disbursements" in Feature Flags.',
    );
    this.name = 'B2CDisbursementsFrozenError';
  }
}

/**
 * Guards `WithdrawalService.approveWithdrawal` against re-attempting a
 * B2C payout while the business's Daraja B2C credentials are known to
 * be broken (§ Daraja B2C production readiness). Auto-enabled by
 * `WithdrawalService` the moment a B2C failure is classified
 * `'permanent_configuration'` — see `lib/integrations/daraja/b2cResultCodes.ts`
 * — specifically so an admin clicking Approve on the *next* withdrawal
 * request can't just walk straight into the identical failure. Never
 * cleared automatically; an operator must confirm the fix and turn the
 * `b2c_disbursements_frozen` feature flag back off themselves.
 */
export async function assertB2CDisbursementsNotFrozen(
  businessId: string,
): Promise<void> {
  const frozen = await featureFlagService.isEnabled(
    businessId,
    'b2c_disbursements_frozen',
  );
  if (frozen) {
    throw new B2CDisbursementsFrozenError();
  }
}
