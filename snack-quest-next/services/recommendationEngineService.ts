import 'server-only';

import {
  intelligenceRecommendationRepository,
  RecommendationNotFoundError,
  IllegalRecommendationTransitionError,
  RecommendationNotApprovedError,
} from '@/repositories/intelligenceRecommendationRepository';
import { machineAssortmentIntelligenceService } from '@/services/machineAssortmentIntelligenceService';
import { peerLearningService } from '@/services/peerLearningService';
import type { DataQuality, SlotPerformance } from '@/services/machineAssortmentIntelligenceService';
import type { IntelligenceRecommendation, RecommendationConfidence } from '@/types';

export { RecommendationNotFoundError, IllegalRecommendationTransitionError, RecommendationNotApprovedError };

/** `dataQuality` never invents a confidence — it downgrades to the honest one, or refuses (§22: "never manufacture confidence"). */
function confidenceFor(dataQuality: DataQuality): RecommendationConfidence | null {
  if (dataQuality === 'actual') return 'high';
  if (dataQuality === 'estimated') return 'medium';
  return null; // insufficient_data — no recommendation gets written from this signal at all
}

/** How many days of stock a restock recommendation aims to leave the slot holding, at its measured velocity — a real operating choice, not a guess disguised as one. */
export const TARGET_DAYS_OF_STOCK = 7;
const MIN_STOCKOUT_FREQUENCY_FOR_DEAD_STOCK_ALTERNATIVE = 0; // dead slots are flagged regardless of stockout state — they're the opposite problem.

export interface RestockNeed {
  slotCode: string;
  productId: string;
  velocityPerDay: number;
  currentQuantity: number;
  capacity: number;
  daysOfStockRemaining: number;
  recommendedQuantity: number;
}

/**
 * The exact math `generateRestockRecommendations` writes into a
 * recommendation — pulled out as its own pure function so
 * `restockCommandCenterService` (§ PART 3 — RESTOCK COMMAND CENTER)
 * can show the fleet the same "at risk" slots and the same
 * recommended quantity live, without either writing a recommendation
 * doc for a page view or maintaining a second copy of this formula
 * that could quietly drift from the one that actually creates
 * recommendations. Returns `null` for a slot that isn't actually at
 * risk (no measured velocity, or already holding
 * `TARGET_DAYS_OF_STOCK`+ days, or nothing left to send within
 * capacity) — never a zero-value result papering over "not at risk."
 */
export function computeRestockNeed(slot: Pick<SlotPerformance, 'slotCode' | 'productId' | 'currentQuantity' | 'capacity' | 'velocityPerDay'>): RestockNeed | null {
  const { velocityPerDay } = slot;
  if (velocityPerDay <= 0) {
    return null;
  }
  const daysOfStockRemaining = slot.currentQuantity / velocityPerDay;
  if (daysOfStockRemaining >= TARGET_DAYS_OF_STOCK) {
    return null;
  }
  const recommendedQuantity = Math.min(
    slot.capacity - slot.currentQuantity,
    Math.max(0, Math.ceil(velocityPerDay * TARGET_DAYS_OF_STOCK) - slot.currentQuantity),
  );
  if (recommendedQuantity <= 0) {
    return null;
  }
  return {
    slotCode: slot.slotCode,
    productId: slot.productId,
    velocityPerDay: Math.round(velocityPerDay * 100) / 100,
    currentQuantity: slot.currentQuantity,
    capacity: slot.capacity,
    daysOfStockRemaining: Math.round(daysOfStockRemaining * 100) / 100,
    recommendedQuantity,
  };
}

class RecommendationEngineService {
  /**
   * Restock recommendations (§ RESTOCK INTELLIGENCE) — one per slot
   * whose measured velocity says it will run out before
   * `TARGET_DAYS_OF_STOCK` days pass at current quantity. Feeds the
   * existing restock workflow; never creates a `RestockTask` itself.
   */
  async generateRestockRecommendations(businessId: string, machineId: string, actor: string): Promise<string[]> {
    const performance = await machineAssortmentIntelligenceService.getAssortmentPerformance(businessId, machineId, 14);
    const confidence = confidenceFor(performance.dataQuality);
    if (!confidence) {
      return [];
    }

    const created: string[] = [];
    for (const slot of performance.slots) {
      // slot.velocityPerDay is already downtime-aware (unitsSold / activeDays, not unitsSold / windowDays) — see machineAssortmentIntelligenceService's own doc comment on why that matters (§ STOCKOUT INTELLIGENCE).
      const need = computeRestockNeed(slot);
      if (!need) {
        continue;
      }

      const existing = await intelligenceRecommendationRepository.findPendingForTarget(businessId, 'RESTOCK', 'machine', machineId);
      if (existing.some((r) => r.data.supportingMetrics.slotCode === slot.slotCode)) {
        continue;
      }

      const id = await intelligenceRecommendationRepository.create({
        businessId,
        type: 'RESTOCK',
        target: { kind: 'machine', id: machineId },
        reason: `Slot ${need.slotCode} (${need.productId}) is selling ~${need.velocityPerDay.toFixed(1)}/day with ${need.currentQuantity} on hand — about ${need.daysOfStockRemaining.toFixed(1)} days of stock left, under the ${TARGET_DAYS_OF_STOCK}-day target.`,
        supportingMetrics: { ...need },
        confidence,
        status: 'pending',
        actionTaken: null,
        actionedAt: null,
        actionedBy: null,
        outcome: null,
        outcomeMetrics: null,
        outcomeRecordedAt: null,
        createdBy: actor,
      });
      created.push(id);
    }
    return created;
  }

  /**
   * Dead-stock recommendations (§ DEAD STOCK) — one per assorted slot
   * with zero sales across the window. Recommends reducing
   * replenishment or reconsidering the assortment; never moves
   * inventory itself.
   */
  async generateDeadStockRecommendations(businessId: string, machineId: string, actor: string): Promise<string[]> {
    const performance = await machineAssortmentIntelligenceService.getAssortmentPerformance(businessId, machineId, 30);
    const confidence = confidenceFor(performance.dataQuality);
    if (!confidence) {
      return [];
    }

    const created: string[] = [];
    for (const slot of performance.slots) {
      if (!slot.dead || slot.currentQuantity <= MIN_STOCKOUT_FREQUENCY_FOR_DEAD_STOCK_ALTERNATIVE) {
        continue;
      }
      const existing = await intelligenceRecommendationRepository.findPendingForTarget(businessId, 'REMOVE_PRODUCT', 'machine', machineId);
      if (existing.some((r) => r.data.supportingMetrics.slotCode === slot.slotCode)) {
        continue;
      }

      const id = await intelligenceRecommendationRepository.create({
        businessId,
        type: 'REMOVE_PRODUCT',
        target: { kind: 'machine', id: machineId },
        reason: `Slot ${slot.slotCode} (${slot.productId}) sold zero units in the last 30 days while carrying ${slot.currentQuantity} units on hand — consider removing it from this machine's assortment or relocating it to a better-fit location.`,
        supportingMetrics: { slotCode: slot.slotCode, productId: slot.productId, currentQuantity: slot.currentQuantity, windowDays: 30, unitsSold: 0 },
        confidence,
        status: 'pending',
        actionTaken: null,
        actionedAt: null,
        actionedBy: null,
        outcome: null,
        outcomeMetrics: null,
        outcomeRecordedAt: null,
        createdBy: actor,
      });
      created.push(id);
    }
    return created;
  }

  /** Wraps `peerLearningService.findProductOpportunities` into stored, trackable recommendations (§ PRODUCT OPPORTUNITY ENGINE). */
  async generateProductOpportunityRecommendations(businessId: string, actor: string, windowDays = 30): Promise<string[]> {
    const opportunities = await peerLearningService.findProductOpportunities(businessId, windowDays);
    const created: string[] = [];

    for (const opportunity of opportunities) {
      const targetId = opportunity.productId ?? opportunity.category;
      const existing = await intelligenceRecommendationRepository.findPendingForTarget(businessId, 'PRODUCT_OPPORTUNITY', 'product', targetId);
      if (existing.some((r) => r.data.supportingMetrics.opportunityType === opportunity.type)) {
        continue;
      }

      const id = await intelligenceRecommendationRepository.create({
        businessId,
        type: 'PRODUCT_OPPORTUNITY',
        target: { kind: 'product', id: targetId },
        reason: opportunity.reason,
        supportingMetrics: { ...opportunity.supportingMetrics, opportunityType: opportunity.type },
        confidence: 'medium',
        status: 'pending',
        actionTaken: null,
        actionedAt: null,
        actionedBy: null,
        outcome: null,
        outcomeMetrics: null,
        outcomeRecordedAt: null,
        createdBy: actor,
      });
      created.push(id);
    }
    return created;
  }

  async findById(businessId: string, recommendationId: string): Promise<IntelligenceRecommendation | null> {
    return intelligenceRecommendationRepository.findById(businessId, recommendationId);
  }

  async listByBusiness(
    businessId: string,
    options: { type?: IntelligenceRecommendation['type']; status?: IntelligenceRecommendation['status']; limit?: number } = {},
  ) {
    return intelligenceRecommendationRepository.listByBusiness(businessId, options);
  }

  async approve(businessId: string, recommendationId: string, actionTaken: string, actor: string): Promise<void> {
    await intelligenceRecommendationRepository.moveStatus(businessId, recommendationId, 'approved', { actionTaken, actionedBy: actor });
  }

  async dismiss(businessId: string, recommendationId: string, actionTaken: string, actor: string): Promise<void> {
    await intelligenceRecommendationRepository.moveStatus(businessId, recommendationId, 'dismissed', { actionTaken, actionedBy: actor });
  }

  /**
   * Records what actually happened after a recommendation was
   * approved and acted on (§ LEARNING FROM RECOMMENDATIONS:
   * "Recommendation → Operator action → Outcome"). Only callable on
   * an `approved` recommendation — recording an outcome for a
   * `pending` one would mean measuring the effect of an action that
   * was never taken, and for a `dismissed` one there is no action to
   * measure at all.
   */
  async recordOutcome(businessId: string, recommendationId: string, outcome: string, outcomeMetrics: Record<string, number | string | null>, actor: string): Promise<void> {
    await intelligenceRecommendationRepository.recordOutcome(businessId, recommendationId, outcome, outcomeMetrics, actor);
  }
}

export const recommendationEngineService = new RecommendationEngineService();
export { RecommendationEngineService };
