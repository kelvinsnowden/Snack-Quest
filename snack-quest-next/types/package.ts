import type { Timestamp } from 'firebase/firestore';
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
  /**
   * Below this, the Admin Inventory view (§ Admin: Inventory) flags
   * the box as low stock. Only meaningful when `stockCount` is
   * tracked — undefined here just means "no alert threshold set",
   * never a fabricated default.
   */
  lowStockThreshold?: number;
  /** Vercel Blob URL — null until an image is uploaded. Synced to the WhatsApp product catalog (§ product catalog sync) alongside name/description/price. */
  imageUrl: string | null;
  /**
   * Free text rather than a plain count (e.g. "10+ snacks", "20+
   * snacks and drinks") since what a box actually contains varies by
   * tier. Undefined = not set — the Pick Your Box bullet is omitted
   * rather than showing a fabricated count.
   */
  snackCountLabel?: string;
  /**
   * Marks this as the exit-intent rescue offer (§ exit-intent rescue
   * offer) — a normal package in every other respect, but excluded
   * from `packageRepository.listActive()` (so it never appears in Pick
   * Your Box, the WhatsApp numbered box list, or the checkout page's
   * own grid) and from the WhatsApp catalog sync `ProductService` owns.
   * It is still purchasable through the exact same checkout — only
   * ever reachable via its direct `/checkout?box=<id>` link, which is
   * what the exit-intent popup uses. At most one package should carry
   * this at a time; that's a business rule, not something the schema
   * enforces. Undefined/false everywhere else.
   */
  isRescueOffer?: boolean;
  /**
   * Real, optional expiration for a limited-time offer like the rescue
   * box — checked both when deciding whether to show the offer and at
   * the checkout gate itself (`ConversationService.startWebCheckout`),
   * so a stale bookmarked link can't buy at an expired price. `null`/
   * undefined = no expiration set, never treated as "already expired".
   */
  offerExpiresAt?: Timestamp | null;
}
