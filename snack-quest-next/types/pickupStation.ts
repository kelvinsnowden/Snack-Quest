import type { AuditFields } from './common';

/**
 * `pickupStations/{stationId}` — a courier pickup point a customer
 * can select as their delivery destination (PLATFORM_ARCHITECTURE_V2.md
 * §12). Imported verbatim from the courier's own station list — see
 * `data/fargoPickupPoints.raw.json` and `scripts/seedPickupStations.mjs`
 * — never hand-authored. `name`, `latitude`, `longitude`, and
 * `description` are preserved exactly as the source provided them;
 * `county`/`town`/`zone` are *computed* classifications for search and
 * pricing, not sourced data, and are nullable where they can't be
 * determined confidently (never guessed with false certainty).
 *
 * Structured for more than Fargo small-package-from-Nairobi from day
 * one, without needing a schema migration when those things become
 * real: `courier` and `shippingOrigin` are strings, not hardcoded
 * assumptions baked into field names; `packageCategory` exists so a
 * future non-"small" package has somewhere to live; door delivery is
 * a wholly separate `deliveryMethod` on the order/snapshot already
 * (§6), not something this collection needs to represent.
 */
export interface PickupStation extends AuditFields {
  businessId: string;
  courier: string;
  /** Exactly as provided by the courier — never edited, never renamed. */
  name: string;
  /** Exactly as provided by the courier. */
  latitude: number;
  longitude: number;
  /** Exactly as provided by the courier. */
  description: string;
  /** Computed from `name` — best-effort, null when not confidently determinable. */
  county: string | null;
  /** Computed from `name` — best-effort, null when not confidently determinable. */
  town: string | null;
  /** The pricing-lookup key (`deliveryZoneRules.zone`) — currently always equal to `county`. */
  zone: string | null;
  shippingOrigin: string;
  packageCategory: string;
  /**
   * Denormalized from `deliveryZoneRules` for fast reads at checkout
   * time — kept in sync by `scripts/seedPickupStations.mjs` /
   * whatever writes `deliveryZoneRules` next. 0 is a real "not yet
   * configured" placeholder, not a fabricated free-delivery price —
   * see `deliveryZoneRules` and `PLATFORM_ARCHITECTURE_V2.md`.
   */
  deliveryFeeKes: number;
  isActive: boolean;
  /** Lowercased name/town/county tokens — the substring/fuzzy search input. */
  searchTokens: string[];
}
