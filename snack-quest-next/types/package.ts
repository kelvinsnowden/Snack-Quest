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
  businessId: string;
  name: string;
  description: string;
  priceKes: number;
  isActive: boolean;
  /**
   * Undefined = unlimited (no real stock ceiling known/set for this
   * box). Present only when the business actually tracks how many of
   * a given box are ready to ship — never a fabricated number.
   */
  stockCount?: number;
  /** Vercel Blob URL — null until an image is uploaded. Synced to the WhatsApp product catalog (§ product catalog sync) alongside name/description/price. */
  imageUrl: string | null;
}
