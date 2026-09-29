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
import { machineRepository } from '@/repositories/machineRepository';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { partnerRepository } from '@/repositories/partnerRepository';
import { locationRepository } from '@/repositories/locationRepository';
import { manufacturerRepository } from '@/repositories/manufacturerRepository';
import type { PermissionKey } from '@/lib/auth/permissions';
import type { SearchResultType } from '@/lib/search/types';

const PER_CATEGORY_LIMIT = 5;
/** Bounded scan size per domain — same discipline as `customerService`'s own 500-doc cap: real and correct at this business's actual scale, not appropriate past "tens of thousands of docs, many tenants" (see that Service's own doc comment). */
const SCAN_LIMIT = 500;
const PHONE_LIKE = /^\+?\d{4,}$/;
/** An M-Pesa receipt or a sale reference: one word, letters and digits. */
const REFERENCE_LIKE = /^[A-Za-z0-9_-]{6,40}$/;

/**
 * What a person must hold to see each kind of result — the same
 * permission that opens that kind's page (`components/admin/adminNav.ts`).
 * A domain the person can't see is never read at all.
 */
export const SEARCH_PERMISSION: Record<SearchResultType, PermissionKey> = {
  order: 'orders.view',
  customer: 'customers.view',
  product: 'products.view',
  inventory: 'products.view',
  supplier: 'procurement.manage',
  purchaseOrder: 'procurement.manage',
  conversation: 'support.conversations.handle',
  creator: 'creators.manage',
  machine: 'machines.view',
  machineSale: 'sales.view',
  machineOwner: 'owners.view',
  location: 'locations.view',
  manufacturer: 'integrations.view',
};

export interface GlobalSearchResponse {
  enabled: boolean;
  results: SearchResult[];
}

/**
 * Fans a query out across every admin-searchable domain in parallel
 * (§ Phase 7: Global search) — no new search index or third-party
 * dependency, just in-memory substring matching over each domain's
 * existing `listByBusiness`-style repository read, the same pattern
 * `lib/pickupStations/search.ts` already established, plus exact
 * lookups for sale references and M-Pesa receipts.
 *
 * Permission aware: each kind of result needs the permission that
 * opens its page (`SEARCH_PERMISSION`), checked with `can`. A domain
 * the person can't see is skipped, not read and filtered.
 */
class GlobalSearchService {
  async search(businessId: string, rawQuery: string, can: (permission: PermissionKey) => boolean): Promise<GlobalSearchResponse> {
    const query = rawQuery.trim();
    const enabled = await featureFlagService.isEnabled(businessId, 'global_search');
    if (!enabled || query.length < 2) {
      return { enabled, results: [] };
    }

    const domains: [SearchResultType, () => Promise<SearchResult[]>][] = [
      ['order', () => this.searchOrders(businessId, query)],
      ['customer', () => this.searchCustomers(businessId, query)],
      ['product', () => this.searchProducts(businessId, query)],
      ['inventory', () => this.searchInventory(businessId, query)],
      ['supplier', () => this.searchSuppliers(businessId, query)],
      ['purchaseOrder', () => this.searchPurchaseOrders(businessId, query)],
      ['conversation', () => this.searchConversations(businessId, query)],
      ['creator', () => this.searchCreators(businessId, query)],
      ['machine', () => this.searchMachines(businessId, query)],
      ['machineSale', () => this.searchMachineSales(businessId, query)],
      ['machineOwner', () => this.searchMachineOwners(businessId, query)],
      ['location', () => this.searchLocations(businessId, query)],
      ['manufacturer', () => this.searchManufacturers(businessId, query)],
    ];
    const pages = await Promise.all(domains.filter(([type]) => can(SEARCH_PERMISSION[type])).map(([, run]) => run()));
    return { enabled, results: pages.flat() };
  }

  private async searchMachines(businessId: string, query: string): Promise<SearchResult[]> {
    const machines = await machineRepository.listAllForBusiness(businessId);
    return machines
      .filter(({ data }) => matchesQuery(query, data.machineCode, data.serialNumber, data.venueName))
      .slice(0, PER_CATEGORY_LIMIT)
      .map(({ id, data }) => ({
        type: 'machine' as const,
        id,
        title: data.machineCode,
        subtitle: [data.venueName, data.serialNumber ? `serial ${data.serialNumber}` : null, data.status].filter(Boolean).join(' · '),
        href: `/admin/vending/${id}`,
      }));
  }

  /** Exact matches only: a sale reference, or an M-Pesa receipt as the customer reads it out. */
  private async searchMachineSales(businessId: string, query: string): Promise<SearchResult[]> {
    if (!REFERENCE_LIKE.test(query)) return [];
    const [byRef, byReceipt] = await Promise.all([
      machineTransactionRepository.findByTransactionRef(businessId, query),
      machineTransactionRepository.findByPaymentRef(businessId, query.toUpperCase()),
    ]);
    const found = [byRef, byReceipt].filter((row): row is NonNullable<typeof row> => row !== null);
    return Array.from(new Map(found.map((row) => [row.id, row])).values()).map(({ id, data }) => ({
      type: 'machineSale' as const,
      id,
      title: data.paymentRef ? `Sale ${data.paymentRef}` : `Sale ${data.transactionRef}`,
      subtitle: `${formatKes(data.amountKes)} · ${data.status.replace(/_/g, ' ')}`,
      href: `/admin/vending/sales/${id}`,
    }));
  }

  private async searchMachineOwners(businessId: string, query: string): Promise<SearchResult[]> {
    const owners = await partnerRepository.listByBusiness(businessId);
    return owners
      .filter(({ data }) => matchesQuery(query, data.name, data.contactEmail, data.contactPhone))
      .slice(0, PER_CATEGORY_LIMIT)
      .map(({ id, data }) => ({
        type: 'machineOwner' as const,
        id,
        title: data.name,
        subtitle: data.contactPhone ?? data.contactEmail ?? data.status,
        href: `/admin/vending/partners/${id}`,
      }));
  }

  private async searchLocations(businessId: string, query: string): Promise<SearchResult[]> {
    const locations = await locationRepository.listByBusiness(businessId);
    return locations
      .filter(({ data }) => matchesQuery(query, data.name, data.area, data.city, data.address))
      .slice(0, PER_CATEGORY_LIMIT)
      .map(({ id, data }) => ({
        type: 'location' as const,
        id,
        title: data.name,
        subtitle: [data.area, data.city].filter(Boolean).join(', '),
        href: `/admin/vending/locations/${id}`,
      }));
  }

  private async searchManufacturers(businessId: string, query: string): Promise<SearchResult[]> {
    const manufacturers = await manufacturerRepository.listByBusiness(businessId);
    return manufacturers
      .filter(({ data }) => matchesQuery(query, data.name, data.slug))
      .slice(0, PER_CATEGORY_LIMIT)
      .map(({ id, data }) => ({
        type: 'manufacturer' as const,
        id,
        title: data.name,
        subtitle: data.slug,
        href: `/admin/vending/integrations/${id}`,
      }));
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
