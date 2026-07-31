import 'server-only';

import { orderRepository } from '@/repositories/orderRepository';
import type { Order } from '@/types';

/**
 * Real customers, derived from `orders` (§ Admin: Customers) — NOT
 * backed by `customerProfiles/{uid}`. That collection is defined in
 * the schema (types/customerProfile.ts) but nothing in this codebase
 * ever writes to it: the real, common customer is a guest WhatsApp
 * shopper identified by phone number, with no Firebase Auth account
 * (see `OrderCustomer.customerId`'s own doc comment). Building this
 * view against `customerProfiles` would mean querying a collection
 * that is always empty — this Service aggregates the data that
 * actually exists instead.
 *
 * Bounded, on-demand aggregation over the most recent orders — not a
 * maintained read-model. Real and correct for the order volumes this
 * business has today; if that stops being true, the fix is a
 * denormalized `customerProfiles` collection kept in sync from
 * `OrderService`, not a bigger limit here.
 */
const AGGREGATION_LIMIT = 500;

export interface CustomerSummary {
  phoneNumber: string;
  customerName: string;
  county: string;
  orderCount: number;
  totalSpentKes: number;
  lastOrderAt: Order['createdAt'];
}

class CustomerService {
  async listCustomers(businessId: string): Promise<CustomerSummary[]> {
    const { orders } = await orderRepository.listByBusiness(businessId, { limit: AGGREGATION_LIMIT });
    return this.aggregate(orders.map((o) => o.data));
  }

  /** Same phone-exact / name-prefix split as the Admin Orders search (§ Admin: Orders), aggregated to one row per matching customer. */
  async searchCustomers(businessId: string, query: string): Promise<CustomerSummary[]> {
    const trimmed = query.trim();
    const orders = /^\+?\d{9,15}$/.test(trimmed)
      ? await orderRepository.searchByPhoneNumber(businessId, trimmed)
      : await orderRepository.searchByCustomerNamePrefix(businessId, trimmed);
    return this.aggregate(orders.map((o) => o.data));
  }

  async getCustomerOrders(
    businessId: string,
    phoneNumber: string,
  ): Promise<{ summary: CustomerSummary | null; orders: { id: string; data: Order }[] }> {
    const orders = await orderRepository.searchByPhoneNumber(businessId, phoneNumber);
    const [summary] = this.aggregate(orders.map((o) => o.data));
    return { summary: summary ?? null, orders };
  }

  private aggregate(orders: Order[]): CustomerSummary[] {
    const byPhone = new Map<string, CustomerSummary>();

    for (const order of orders) {
      const { phoneNumber, customerName, county } = order.customer;
      const existing = byPhone.get(phoneNumber);
      const orderCreatedAt = order.createdAt;

      if (!existing) {
        byPhone.set(phoneNumber, {
          phoneNumber,
          customerName: customerName || 'Guest',
          county,
          orderCount: 1,
          totalSpentKes: order.pricing.totalKes,
          lastOrderAt: orderCreatedAt,
        });
        continue;
      }

      existing.orderCount += 1;
      existing.totalSpentKes += order.pricing.totalKes;
      if (toMillis(orderCreatedAt) > toMillis(existing.lastOrderAt)) {
        existing.lastOrderAt = orderCreatedAt;
        existing.customerName = customerName || existing.customerName;
        existing.county = county;
      }
    }

    return Array.from(byPhone.values()).sort((a, b) => toMillis(b.lastOrderAt) - toMillis(a.lastOrderAt));
  }
}

function toMillis(value: Order['createdAt']): number {
  const timestamp = value as unknown as { toMillis?: () => number };
  return timestamp?.toMillis ? timestamp.toMillis() : 0;
}

export const customerService = new CustomerService();
export { CustomerService };
