import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

/**
 * `intelligenceRecommendations/{recommendationId}` — a normalized,
 * explainable recommendation record (§ RECOMMENDATION ENGINE,
 * § LEARNING FROM RECOMMENDATIONS). Every recommendation this codebase
 * produces — restock, dead-stock removal, a product opportunity —
 * writes exactly this shape, never a bespoke ad-hoc object, so
 * "recommendation → operator action → outcome" (§21) can be tracked
 * uniformly regardless of which generator produced it.
 *
 * Deliberately never auto-executed: `status` starts `pending` and
 * only a staff decision moves it to `approved`/`dismissed`
 * (§ RESTOCK INTELLIGENCE: "the recommendation should feed the
 * existing restock workflow" — feed, not replace; § DEAD STOCK: "do
 * not automatically move inventory without workflow approval").
 */
export type RecommendationType =
  | 'RESTOCK'
  | 'ASSORTMENT_CHANGE'
  | 'REMOVE_PRODUCT'
  | 'MOVE_PRODUCT'
  | 'PRICE_REVIEW'
  | 'PRODUCT_OPPORTUNITY'
  | 'LOCATION_PROFILE';

export type RecommendationStatus = 'pending' | 'approved' | 'dismissed';

/**
 * Never a probability — this codebase computes deterministic
 * statistics, not a model with a real confidence interval (§23: "do
 * not pretend statistical heuristics are machine learning"). `high`
 * means the underlying window had `dataQuality: 'actual'`; `medium`
 * means `'estimated'`; `low` means the signal is real but the window
 * itself was thin. A generator that would otherwise produce
 * `dataQuality: 'insufficient_data'` does not write a recommendation
 * at all — never manufactures a `low`-confidence one from nothing.
 */
export type RecommendationConfidence = 'high' | 'medium' | 'low';

export type RecommendationTargetKind = 'machine' | 'location' | 'product' | 'network';

export interface RecommendationTarget {
  kind: RecommendationTargetKind;
  /** Null only for `kind: 'network'` — every other target kind names a real id. */
  id: string | null;
}

export const RECOMMENDATION_STATUS_TRANSITIONS: Record<RecommendationStatus, RecommendationStatus[]> = {
  pending: ['approved', 'dismissed'],
  approved: [],
  dismissed: [],
};

export interface IntelligenceRecommendation extends AuditFields {
  businessId: string;
  type: RecommendationType;
  target: RecommendationTarget;
  reason: string;
  supportingMetrics: Record<string, number | string | null>;
  confidence: RecommendationConfidence;
  status: RecommendationStatus;
  /** Set only once a staff member approves or dismisses — free text on what they actually decided to do, never inferred from `status` alone. */
  actionTaken: string | null;
  actionedAt: Timestamp | null;
  actionedBy: string | null;
  /**
   * Recorded later, once real outcome data exists (§21: "Recommendation
   * → Operator action → Outcome"). Null until someone comes back and
   * measures it — never backfilled with a guess.
   */
  outcome: string | null;
  outcomeMetrics: Record<string, number | string | null> | null;
  outcomeRecordedAt: Timestamp | null;
}
