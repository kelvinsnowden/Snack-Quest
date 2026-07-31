import type { AuditFields } from './common';

/**
 * `packages/{packageId}` — a purchasable Snack Quest box
 * (PLATFORM_ARCHITECTURE_V2.md §5). Deliberately minimal here: just
 * enough real fields for the Conversation Domain to present real
 * options instead of hardcoded strings. The fuller Commerce Domain
 * (monthlyThemes, discounts, countries) is out of scope until its own
 * milestone.
 */
export interface Package extends AuditFields {
  name: string;
  description: string;
  priceKes: number;
  isActive: boolean;
}
