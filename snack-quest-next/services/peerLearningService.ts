import 'server-only';

import { locationService } from '@/services/locationService';
import { productIntelligenceService } from '@/services/productIntelligenceService';
import { networkIntelligenceService } from '@/services/networkIntelligenceService';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { classifyDataQuality, type DataQuality } from '@/services/machineAssortmentIntelligenceService';
import type { Location } from '@/types';

export interface LocationTypeProductPerformance {
  locationType: Location['locationType'];
  locationCount: number;
  totalRevenueKes: number;
  avgRevenuePerLocationKes: number;
}

export interface ProductLocationTypeAffinity {
  productId: string;
  windowDays: number;
  byType: LocationTypeProductPerformance[];
  /**
   * The location type with the highest average revenue per location
   * for this product — set only when at least two *different* types
   * each have at least one location actually selling it, since one
   * type "winning" against zero comparison points is not a real
   * comparison (§ LOCATION-TO-LOCATION LEARNING: "based on observed
   * data"). Null otherwise, never guessed at.
   */
  bestPerformingLocationType: Location['locationType'] | null;
  dataQuality: DataQuality;
}

export interface AssortmentRecommendationCandidate {
  productId: string;
  productName: string;
  category: string | null;
  avgRevenuePerLocationKes: number;
  avgMarginPct: number | null;
  reason: string;
}

export type ProductOpportunityType = 'shallow_assortment_high_demand' | 'repeated_stockout' | 'price_gap';

export interface ProductOpportunity {
  type: ProductOpportunityType;
  productId: string | null;
  category: string | null;
  reason: string;
  supportingMetrics: Record<string, number | string | null>;
}

/**
 * Location-to-location learning, new-machine assortment
 * recommendations, and the product opportunity engine
 * (§ LOCATION-TO-LOCATION LEARNING, § NEW MACHINE ASSORTMENT
 * RECOMMENDATION, § PRODUCT OPPORTUNITY ENGINE). Every output here is
 * a grouped average or a threshold comparison over real
 * `productIntelligenceService`/`locationIntelligenceService` data —
 * explicitly **not** machine learning (§23: "do not pretend
 * statistical heuristics are machine learning"), and every method
 * refuses to produce a confident-sounding answer from too little data
 * rather than inventing one.
 */
class PeerLearningService {
  /** How one product performs across every location type it's assorted to (§ LOCATION-TO-LOCATION LEARNING). */
  async getProductLocationTypeAffinity(businessId: string, productId: string, windowDays = 30): Promise<ProductLocationTypeAffinity> {
    const locations = await locationService.listByBusiness(businessId);
    const byType = new Map<Location['locationType'], { revenueKes: number; sellingLocationCount: number }>();
    let daysObserved = 0;

    for (const { id: locationId, data } of locations) {
      const performance = await productIntelligenceService.getLocationProductPerformance(businessId, locationId, windowDays);
      const product = performance.find((p) => p.productId === productId);
      if (!product) {
        continue;
      }
      daysObserved = Math.max(daysObserved, product.daysWithData);
      if (product.unitsSold === 0) {
        continue;
      }
      const bucket = byType.get(data.locationType) ?? { revenueKes: 0, sellingLocationCount: 0 };
      bucket.revenueKes += product.revenueKes;
      bucket.sellingLocationCount += 1;
      byType.set(data.locationType, bucket);
    }

    const results: LocationTypeProductPerformance[] = Array.from(byType.entries()).map(([locationType, bucket]) => ({
      locationType,
      locationCount: bucket.sellingLocationCount,
      totalRevenueKes: bucket.revenueKes,
      avgRevenuePerLocationKes: Math.round((bucket.revenueKes / bucket.sellingLocationCount) * 100) / 100,
    }));

    const typesWithSignal = results.filter((r) => r.locationCount >= 1);
    const bestPerformingLocationType =
      typesWithSignal.length >= 2 ? typesWithSignal.sort((a, b) => b.avgRevenuePerLocationKes - a.avgRevenuePerLocationKes)[0].locationType : null;

    return {
      productId,
      windowDays,
      byType: results,
      bestPerformingLocationType,
      dataQuality: classifyDataQuality(daysObserved, windowDays),
    };
  }

  /**
   * A ranked candidate list for a proposed new machine
   * (§ NEW MACHINE ASSORTMENT RECOMMENDATION) — global-catalog
   * products ranked by how they've actually performed at existing
   * locations of the same `locationType`, filtered to a price band
   * when given. The *composition* (which specific SKUs) is never
   * hard-coded; only the ranking method is.
   */
  async recommendAssortmentForNewMachine(
    businessId: string,
    locationType: Location['locationType'],
    slotCount: number,
    priceBandKes?: { min: number; max: number },
  ): Promise<AssortmentRecommendationCandidate[]> {
    const locations = await locationService.listByType(businessId, locationType);
    const totals = new Map<string, { revenueKes: number; grossProfitKes: number; locationCount: number; category: string | null }>();

    for (const { id: locationId } of locations) {
      const performance = await productIntelligenceService.getLocationProductPerformance(businessId, locationId, 30);
      for (const product of performance) {
        if (product.unitsSold === 0) {
          continue;
        }
        const existing = totals.get(product.productId) ?? { revenueKes: 0, grossProfitKes: 0, locationCount: 0, category: product.category };
        existing.revenueKes += product.revenueKes;
        existing.grossProfitKes += product.grossProfitKes;
        existing.locationCount += 1;
        totals.set(product.productId, existing);
      }
    }

    const snackItems = await snackItemRepository.findManyById(Array.from(totals.keys()));
    const candidates: AssortmentRecommendationCandidate[] = [];
    for (const [productId, totalsForProduct] of totals) {
      const item = snackItems.get(productId);
      const avgRevenuePerLocationKes = Math.round((totalsForProduct.revenueKes / totalsForProduct.locationCount) * 100) / 100;
      if (priceBandKes && item && (item.expectedUnitCostKes < priceBandKes.min || item.expectedUnitCostKes > priceBandKes.max)) {
        continue;
      }
      candidates.push({
        productId,
        productName: item?.name ?? productId,
        category: totalsForProduct.category,
        avgRevenuePerLocationKes,
        avgMarginPct: totalsForProduct.revenueKes > 0 ? Math.round((totalsForProduct.grossProfitKes / totalsForProduct.revenueKes) * 10000) / 100 : null,
        reason: `Sold at ${totalsForProduct.locationCount} existing ${locationType}-type location(s), averaging KES ${avgRevenuePerLocationKes.toLocaleString('en-KE')} revenue/location in the last 30 days.`,
      });
    }

    return candidates.sort((a, b) => b.avgRevenuePerLocationKes - a.avgRevenuePerLocationKes).slice(0, slotCount);
  }

  /**
   * Deterministic, explainable opportunity detection
   * (§ PRODUCT OPPORTUNITY ENGINE) — three real heuristics, each
   * named for exactly what it checks, none dressed up as prediction:
   * a category selling well but thinly assorted, a product that
   * keeps running out, and a product priced far from its own
   * category's peer average.
   */
  async findProductOpportunities(businessId: string, windowDays = 30): Promise<ProductOpportunity[]> {
    const opportunities: ProductOpportunity[] = [];
    const overview = await networkIntelligenceService.getNetworkOverview(businessId, windowDays);
    const products = await productIntelligenceService.getNetworkProductPerformance(businessId, windowDays);

    // Shallow assortment in a high-demand category: a top-revenue category whose products are, on average, stocked at few locations.
    for (const category of overview.topCategories) {
      const categoryProducts = products.filter((p) => p.category === category.category);
      if (categoryProducts.length === 0) {
        continue;
      }
      const avgLocationsStocked = categoryProducts.reduce((sum, p) => sum + p.locationsStocked, 0) / categoryProducts.length;
      if (avgLocationsStocked > 0 && avgLocationsStocked < overview.locationCount * 0.3 && overview.locationCount >= 3) {
        opportunities.push({
          type: 'shallow_assortment_high_demand',
          productId: null,
          category: category.category,
          reason: `"${category.category}" is a top-revenue category (KES ${category.revenueKes.toLocaleString('en-KE')} in ${windowDays} days) but its products are assorted at only ~${Math.round(avgLocationsStocked)} of ${overview.locationCount} locations on average.`,
          supportingMetrics: { categoryRevenueKes: category.revenueKes, avgLocationsStocked: Math.round(avgLocationsStocked * 100) / 100, totalLocations: overview.locationCount },
        });
      }
    }

    // Repeated stockout: a real, recurring signal, not a one-off.
    for (const product of products) {
      if (product.stockoutFrequencyPct >= 30 && product.dataQuality !== 'insufficient_data') {
        opportunities.push({
          type: 'repeated_stockout',
          productId: product.productId,
          category: product.category,
          reason: `Stocked out in ~${product.stockoutFrequencyPct}% of the observed (machine × day) window — a recurring stockout, not a one-off.`,
          supportingMetrics: { stockoutFrequencyPct: product.stockoutFrequencyPct, velocityPerDay: product.velocityPerDay },
        });
      }
    }

    // Price gap: this product's own average price vs. its category's peer *median* — excluding itself, and a median rather than a mean specifically so one real outlier is judged against its peers instead of dragging their own comparison point toward itself.
    const pricesByCategory = new Map<string, { productId: string; priceKes: number }[]>();
    for (const product of products) {
      if (product.unitsSold === 0 || !product.category) {
        continue;
      }
      const list = pricesByCategory.get(product.category) ?? [];
      list.push({ productId: product.productId, priceKes: product.revenueKes / product.unitsSold });
      pricesByCategory.set(product.category, list);
    }
    for (const product of products) {
      if (product.unitsSold === 0 || !product.category) {
        continue;
      }
      const peers = (pricesByCategory.get(product.category) ?? []).filter((p) => p.productId !== product.productId);
      if (peers.length < 3) {
        continue;
      }
      const peerPricesSorted = peers.map((p) => p.priceKes).sort((a, b) => a - b);
      const mid = Math.floor(peerPricesSorted.length / 2);
      const peerMedianPriceKes = peerPricesSorted.length % 2 === 0 ? (peerPricesSorted[mid - 1] + peerPricesSorted[mid]) / 2 : peerPricesSorted[mid];
      const ownPriceKes = product.revenueKes / product.unitsSold;
      const deviationPct = peerMedianPriceKes > 0 ? Math.round(((ownPriceKes - peerMedianPriceKes) / peerMedianPriceKes) * 10000) / 100 : 0;
      if (Math.abs(deviationPct) >= 25) {
        opportunities.push({
          type: 'price_gap',
          productId: product.productId,
          category: product.category,
          reason: `Average realized price (KES ${Math.round(ownPriceKes)}) is ${deviationPct > 0 ? 'above' : 'below'} its "${product.category}" peer median (KES ${Math.round(peerMedianPriceKes)}) by ${Math.abs(deviationPct)}%.`,
          supportingMetrics: { ownPriceKes: Math.round(ownPriceKes * 100) / 100, peerMedianPriceKes: Math.round(peerMedianPriceKes * 100) / 100, deviationPct },
        });
      }
    }

    return opportunities;
  }
}

export const peerLearningService = new PeerLearningService();
export { PeerLearningService };
