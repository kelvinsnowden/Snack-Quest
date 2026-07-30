import { getDb, saveDb, generateUuid, getNowIso, addAuditLog } from '../../api/repositories/dbRepository';
import { Order, OrderStatus } from '../../types/database';

export class OrderService {
  static getAllOrders(filters?: { status?: string; customerId?: string; search?: string }) {
    const db = getDb();
    let orders = [...(db.orders || [])];

    if (filters?.status) {
      orders = orders.filter((o) => o.order_status.toLowerCase() === filters.status!.toLowerCase());
    }
    if (filters?.customerId) {
      orders = orders.filter((o) => o.customer_id === filters.customerId);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      orders = orders.filter((o) => o.id.toLowerCase().includes(q));
    }

    return orders;
  }

  static getOrderById(id: string) {
    const db = getDb();
    const order = db.orders.find((o) => o.id === id);
    if (!order) return null;

    const items = db.order_snack_items?.filter((i) => i.order_id === order.id) || [];
    const statusHistory = db.order_status_history?.filter((h) => h.order_id === order.id) || [];
    const customer = db.customers?.find((c) => c.id === order.customer_id) || null;
    const payment = db.payments?.find((p) => p.order_id === order.id) || null;

    return {
      ...order,
      customer,
      items,
      payment,
      status_history: statusHistory,
    };
  }

  static createOrder(payload: any) {
    const db = getDb();
    const orderId = `ord-${generateUuid().substring(0, 8)}`;
    const now = getNowIso();

    const sellingPrice = Number(payload.selling_price || payload.total_cents) || 350000;
    const discount = Number(payload.discount) || 0;

    const newOrder: Order = {
      id: orderId,
      customer_id: payload.customer_id || 'cust-1',
      order_date: now,
      package_id: payload.package_id || 'pkg-standard',
      selling_price: sellingPrice,
      discount,
      quest_credits_used: 0,
      tax_amount: Math.round(sellingPrice * 0.16),
      final_amount_paid: sellingPrice - discount,
      packaging_cost: 15000,
      snack_cost: 120000,
      delivery_cost: 50000,
      payment_fees: 3500,
      advertising_cost: 20000,
      gross_profit: sellingPrice - discount - 120000 - 15000,
      net_profit: sellingPrice - discount - 120000 - 15000 - 50000 - 3500 - 20000,
      order_status: (payload.order_status as OrderStatus) || 'pending',
      payment_status: 'pending',
      courier_id: 'courier-fargo',
      tracking_number: `TRK-${Math.floor(100000 + Math.random() * 900000)}`,
      landing_page_id: null,
      session_id: null,
      utm_source: 'api_gateway',
      utm_campaign: 'v1_orders',
      fbclid: null,
      gclid: null,
      ttclid: null,
      referral_code_used: payload.referral_code || null,
      order_source: 'shopify',
      county: payload.county || 'Nairobi',
      stock_shortage: false,
      balance_due: sellingPrice - discount,
      created_by: payload.customer_id || 'api',
      updated_by: payload.customer_id || 'api',
      created_at: now,
      updated_at: now,
    };

    db.orders.unshift(newOrder);

    if (!db.order_status_history) db.order_status_history = [];
    db.order_status_history.unshift({
      id: generateUuid(),
      order_id: orderId,
      from_status: null,
      to_status: newOrder.order_status,
      note: 'Order created via API Gateway',
      changed_by: payload.customer_id || 'API Client',
      changed_at: now,
      created_at: now,
      updated_at: now,
    });

    addAuditLog('user', payload.customer_id || 'api', 'Order Service', 'order_created', 'order', orderId, `Created Order ${orderId}`);
    saveDb();

    return newOrder;
  }

  static updateOrderStatus(orderId: string, status: OrderStatus, note?: string, changedBy = 'Admin OS') {
    const db = getDb();
    const order = db.orders.find((o) => o.id === orderId);

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    const previousStatus = order.order_status;
    order.order_status = status;
    order.updated_at = getNowIso();

    if (!db.order_status_history) db.order_status_history = [];
    db.order_status_history.unshift({
      id: generateUuid(),
      order_id: order.id,
      from_status: previousStatus,
      to_status: status,
      note: note || `Status transitioned from ${previousStatus} to ${status}`,
      changed_by: changedBy,
      changed_at: getNowIso(),
      created_at: getNowIso(),
      updated_at: getNowIso(),
    });

    addAuditLog('user', changedBy, 'Order Service', 'order_status_updated', 'order', order.id, `Order ${order.id} changed from ${previousStatus} to ${status}`);
    saveDb();

    return order;
  }

  static cancelOrder(orderId: string, reason?: string) {
    return this.updateOrderStatus(orderId, 'cancelled', reason || 'Order cancelled by user or admin');
  }
}
