import 'server-only';

import { orderRepository } from '@/repositories/orderRepository';
import { customerService } from '@/services/customerService';
import { packageRepository } from '@/repositories/packageRepository';
import { supplierRepository } from '@/repositories/supplierRepository';
import { purchaseOrderRepository } from '@/repositories/purchaseOrderRepository';
import { conversationRepository } from '@/repositories/conversationRepository';
import { creatorRepository } from '@/repositories/creatorRepository';
import { userRepository } from '@/repositories/userRepository';
import { featureFlagService } from '@/services/featureFlagService';
import { matchesQuery, type SearchResult } from '@/lib/search/types';
import { formatKes } from '@/lib/orders/format';

const PER_CATEGORY_LIMIT = 5;
/** Bounded scan size per domain — same discipline as `customerService`'s own 500-doc cap: real and correct at this business's actual scale, not appropriate past "tens of thousands of docs, many tenants" (see that Service's own doc comment). */
const SCAN_LIMIT = 500;
const PHONE_LIKE = /^\+?\d{4,}$/;

export interface GlobalSearchResponse {
  enabled: boolean;
  results: SearchResult[];
}

/**
 * Fans a query out across every admin-searchable domain in parallel
 * (§ Phase 7: Global search) — no new search index or third-party
 * dependency, just in-memory substring matching over each domain's
 * existing `listByBusiness`-style repository read, the same pattern
 * `lib/pickupStations/search.ts` already established. "Permission
 * aware" here means what actually exists in this codebase's access
 * model: Global Search only runs inside `/admin`, which `agent`/
 * `warehouse`/`finance` staff never reach at all (they're routed to
 * their own separate workspaces at the layout level) — there is no
 * per-role result filtering anywhere else in `/admin` to be
 * consistent with, so this doesn't invent one.
 */
class GlobalSearchService {
  async search(businessId: string, rawQuery: string): Promise<GlobalSearchResponse> {
    const query = rawQuery.trim();
    const enabled = await featureFlagService.isEnabled(businessId, 'global_search');
    if (!enabled || query.length < 2) {
      return { enabled, results: [] };
    }

    const [orders, customers, products, inventory, suppliers, purchaseOrders, conversations, creators] = await Promise.all([
      this.searchOrders(businessId, query),
      this.searchCustomers(businessId, query),
      this.searchProducts(businessId, query),
      this.searchInventory(businessId, query),
      this.searchSuppliers(businessId, query),
      this.searchPurchaseOrders(businessId, query),
      this.searchConversations(businessId, query),
      this.searchCreators(businessId, query),
    ]);

    return {
      enabled,
      results: [...orders, ...customers, ...products, ...inventory, ...suppliers, ...purchaseOrders, ...conversations, ...creators],
    };
  }

  private async searchOrders(businessId: string, query: string): Promise<SearchResult[]> {
    const orders = PHONE_LIKE.test(query)
      ? await orderRepository.searchByPhoneNumber(businessId, query)
      : await orderRepository.searchByCustomerNamePrefix(businessId, query);

    return orders.slice(0, PER_CATEGORY_LIMIT).map(({ id, data }) => ({
      type: 'order' as const,
      id,
      title: `${data.customer.customerName || 'Guest'} — ${data.product.packageLabel}`,
      subtitle: `${formatKes(data.pricing.totalKes)} · ${data.customer.phoneNumber}`,
      href: `/admin/orders/${id}`,
    }));
  }

  private async searchCustomers(businessId: string, query: string): Promise<SearchResult[]> {
    const customers = await customerService.searchCustomers(businessId, query);
    return customers.slice(0, PER_CATEGORY_LIMIT).map((customer) => ({
      type: 'customer' as const,
      id: customer.phoneNumber,
      title: customer.customerName,
      subtitle: `${customer.phoneNumber} · ${customer.orderCount} order${customer.orderCount === 1 ? '' : 's'}`,
      href: `/admin/customers/${encodeURIComponent(customer.phoneNumber)}`,
    }));
  }

  private async searchProducts(businessId: string, query: string): Promise<SearchResult[]> {
    const packages = await packageRepository.listAllByBusiness(businessId);
    return packages
      .filter(({ data }) => matchesQuery(query, data.name))
      .slice(0, PER_CATEGORY_LIMIT)
      .map(({ id, data }) => ({
        type: 'product' as const,
        id,
        title: data.name,
        subtitle: formatKes(data.priceKes),
        href: `/admin/products/${id}`,
      }));
  }

  private async searchInventory(businessId: string, query: string): Promise<SearchResult[]> {
    const packages = await packageRepository.listAllByBusiness(businessId);
    return packages
      .filter(({ data }) => matchesQuery(query, data.name))
      .slice(0, PER_CATEGORY_LIMIT)
      .map(({ id, data }) => ({
        type: 'inventory' as const,
        id,
        title: data.name,
        subtitle: data.stockCount !== undefined ? `${data.stockCount} in stock` : 'Stock not tracked',
        href: `/admin/inventory`,
      }));
  }

  private async searchSuppliers(businessId: string, query: string): Promise<SearchResult[]> {
    const suppliers = await supplierRepository.listByBusiness(businessId);
    return suppliers
      .filter(({ data }) => matchesQuery(query, data.name, data.contactName, data.phone, data.email))
      .slice(0, PER_CATEGORY_LIMIT)
      .map(({ id, data }) => ({
        type: 'supplier' as const,
        id,
        title: data.name,
        subtitle: `${data.contactName} · ${data.phone}`,
        href: `/admin/suppliers`,
      }));
  }

  private async searchPurchaseOrders(businessId: string, query: string): Promise<SearchResult[]> {
    const [{ purchaseOrders }, suppliers] = await Promise.all([
      purchaseOrderRepository.listByBusiness(businessId, { limit: SCAN_LIMIT }),
      supplierRepository.listByBusiness(businessId),
    ]);
    const supplierNames = new Map(suppliers.map(({ id, data }) => [id, data.name]));

    return purchaseOrders
      .filter(({ id, data }) => matchesQuery(query, id, supplierNames.get(data.supplierId), data.notes))
      .slice(0, PER_CATEGORY_LIMIT)
      .map(({ id, data }) => ({
        type: 'purchaseOrder' as const,
        id,
        title: `PO for ${supplierNames.get(data.supplierId) ?? 'Unknown supplier'}`,
        subtitle: `${formatKes(data.totalCostKes)} · ${data.status}`,
        href: `/admin/purchase-orders/${id}`,
      }));
  }

  private async searchConversations(businessId: string, query: string): Promise<SearchResult[]> {
    const { conversations } = await conversationRepository.listByBusiness(businessId, { limit: SCAN_LIMIT });
    return conversations
      .filter(({ data }) => matchesQuery(query, data.phoneNumber, data.stateBlob?.customerName))
      .slice(0, PER_CATEGORY_LIMIT)
      .map(({ id, data }) => ({
        type: 'conversation' as const,
        id,
        title: data.stateBlob?.customerName || data.phoneNumber,
        subtitle: `${data.phoneNumber} · ${data.status}`,
        href: `/admin/conversations/${id}`,
      }));
  }

  private async searchCreators(businessId: string, query: string): Promise<SearchResult[]> {
    const { creators } = await creatorRepository.listByBusiness(businessId, { limit: SCAN_LIMIT });
    const withIdentity = await Promise.all(
      creators.map(async ({ id, data }) => ({ id, data, user: await userRepository.findById(id) })),
    );

    return withIdentity
      .filter(({ data, user }) => matchesQuery(query, user?.displayName, user?.email, data.referralCode, data.niche))
      .slice(0, PER_CATEGORY_LIMIT)
      .map(({ id, data, user }) => ({
        type: 'creator' as const,
        id,
        title: user?.displayName ?? 'Unknown creator',
        subtitle: `${data.tier} · ${data.status}`,
        href: `/admin/creators/${id}`,
      }));
  }
}

export const globalSearchService = new GlobalSearchService();
export { GlobalSearchService };
