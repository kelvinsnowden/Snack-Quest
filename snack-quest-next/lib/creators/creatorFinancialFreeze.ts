import 'server-only';

import { featureFlagService } from '@/services/featureFlagService';

export class CreatorFinancialWritesFrozenError extends Error {
  constructor() {
    super(
      'Creator financial writes are briefly paused for maintenance. Please try again shortly.',
    );
    this.name = 'CreatorFinancialWritesFrozenError';
  }
}

/**
 * Guards every real write to a creator's KES balance (withdrawal
 * request/approve/reject, referral commission crediting) during the
 * `creatorProfiles` → `creatorMemberships` schema migration's cutover
 * window — see the migration plan's data-migration procedure. Toggled
 * via the existing Feature Flags admin UI
 * (`creator_financial_writes_frozen`), no deploy required. Defaults
 * off; only ever meant to be on for the few minutes a production data
 * copy is actually running.
 */
export async function assertCreatorFinancialWritesNotFrozen(
  businessId: string,
): Promise<void> {
  const frozen = await featureFlagService.isEnabled(
    businessId,
    'creator_financial_writes_frozen',
  );
  if (frozen) {
    throw new CreatorFinancialWritesFrozenError();
  }
}
