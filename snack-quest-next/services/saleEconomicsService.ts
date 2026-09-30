import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { machineEconomicProfileService } from '@/services/machineEconomicProfileService';
import { priceBookService } from '@/services/priceBookService';
import { logger } from '@/lib/observability/logger';
import type { Machine, MachineTransaction, SaleEconomicsSnapshot } from '@/types';

/**
 * Freezes a sale's economics at the moment it is created
 * (§ HISTORICAL PRICE SNAPSHOTS): what the customer is charged, Snack
 * Quest's landed cost and the owner price in effect then, and who owned
 * the machine and its stock on what terms. Settlement, the P&L and the
 * owner portal read this snapshot, so a later cost change never rewrites
 * what an old sale cost.
 */
class SaleEconomicsService {
  async snapshotFor(input: {
    businessId: string;
    machineId: string;
    machine: Pick<Machine, 'ownershipType' | 'ownerPartnerId' | 'locationId'>;
    productCatalogue: MachineTransaction['productCatalogue'];
    productId: string;
    retailPriceKes: number;
  }): Promise<SaleEconomicsSnapshot | null> {
    try {
      const [profile, prices] = await Promise.all([
        machineEconomicProfileService.resolveFor(input.businessId, input.machineId, input.machine),
        priceBookService.currentPrices(input.businessId, input.productCatalogue, input.productId),
      ]);
      return {
        retailPriceKes: input.retailPriceKes,
        landedCostKes: prices.landedCostKes,
        ownerWholesaleKes: prices.ownerWholesaleKes,
        ownershipType: profile.ownershipType,
        inventoryOwner: profile.terms.inventoryOwner,
        ownerCostBasis: profile.terms.ownerCostBasis,
        partnerId: profile.partnerId,
        agreementId: profile.agreementId,
        resolvedAt: Timestamp.now() as unknown as SaleEconomicsSnapshot['resolvedAt'],
      };
    } catch (error) {
      // A customer is standing at the machine: a failed cost read must not stop the sale. The sale is
      // stored without a snapshot, and every report counts it as "cost estimated" rather than exact.
      logger.error('sale economics snapshot failed; the sale continues without one', { businessId: input.businessId, machineId: input.machineId, productId: input.productId, error });
      return null;
    }
  }
}

export const saleEconomicsService = new SaleEconomicsService();
