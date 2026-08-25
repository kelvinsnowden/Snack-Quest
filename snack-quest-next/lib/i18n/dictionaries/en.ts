/**
 * The English dictionary, and the source of truth for what keys exist
 * (§ Admin in Simplified Chinese).
 *
 * Typed as a const so `Dictionary` is derived from it: a translation
 * that invents a key, or misses one, fails to compile rather than
 * failing silently at 2am in front of somebody who does not read
 * English.
 *
 * Keys are named for where the string appears, not for the words in
 * it. `nav.orders` survives a rewrite of the label; `nav.ordersLabel`
 * or `nav.myOrders` does not.
 *
 * Deliberately covers the shell and the screens a visitor is walked
 * through, not all 56 admin pages. Anything without a key here renders
 * its English literal exactly as it does today — see `translate`,
 * which falls back rather than throwing. A half-translated portal is
 * usable; one that crashes on a missing key is not.
 */
export const en = {
  language: {
    label: 'Language',
    switchTo: 'Switch language',
  },

  nav: {
    admin: 'Admin',
    navigation: 'Admin navigation',
    groups: {
      Overview: 'Overview',
      'Orders & delivery': 'Orders & delivery',
      'Catalogue & stock': 'Catalogue & stock',
      Customers: 'Customers',
      Creators: 'Creators',
      Money: 'Money',
      Marketing: 'Marketing',
      System: 'System',
    },
    items: {
      '/admin': 'Dashboard',
      '/admin/analytics': 'Analytics',
      '/admin/orders': 'Orders',
      '/admin/deliveries': 'Deliveries',
      '/admin/fulfillment-batches': 'Fulfillment batches',
      '/admin/delivery-zones': 'Delivery zones',
      '/admin/products': 'Products',
      '/admin/inventory': 'Inventory',
      '/admin/snack-items': 'Snacks',
      '/admin/recipes': 'Box recipes',
      '/admin/purchase-orders': 'Purchase orders',
      '/admin/suppliers': 'Suppliers',
      '/admin/conversations': 'Conversations',
      '/admin/customers': 'Customers',
      '/admin/reviews': 'Reviews',
      '/admin/creators': 'Creators',
      '/admin/campaigns': 'Campaigns',
      '/admin/referrals': 'Referrals',
      '/admin/withdrawals': 'Withdrawals',
      '/admin/reconciliation': 'Reconciliation',
      '/admin/faqs': 'FAQ',
      '/admin/marketing-emails': 'Marketing Emails',
      '/admin/marketing-sms': 'Marketing SMS',
      '/admin/sms-opt-outs': 'SMS opt-outs',
      '/admin/notification-templates': 'Notification Templates',
      '/admin/storage': 'Storage',
      '/admin/operations': 'Operations',
      '/admin/audit-logs': 'Audit logs',
      '/admin/staff': 'Staff',
      '/admin/settings': 'Settings',
    },
    shortItems: {
      '/admin/fulfillment-batches': 'Batches',
      '/admin/recipes': 'Recipes',
      '/admin/marketing-sms': 'SMS',
      '/admin/sms-opt-outs': 'Opt-outs',
    },
  },

  search: {
    trigger: 'Search…',
    label: 'Search',
    typeMore: 'Type at least 2 characters to search.',
    noResults: 'No results for “{query}”.',
    placeholder: 'Search orders, customers, products, suppliers, conversations…',
  },

  dashboard: {
    welcome: 'Welcome back, {name}',
    subtitle: "Here's what's happening at {business} right now.",
    noAccess: 'You don’t have access to {section}. Ask a super admin if you need it.',
    revenue30: 'Revenue (30 days)',
    totalOrders: 'Total orders',
    awaitingAgent: 'Awaiting a human agent',
    staffMembers: 'Staff members',
    revenueUp: 'Revenue is up {percent}% vs the previous 30 days',
    revenueDown: 'Revenue is down {percent}% vs the previous 30 days',
    revenueDeltaMore: '({amount} more than last period)',
    revenueDeltaLess: '({amount} less than last period)',
    revenueChart: 'Revenue, last 30 days',
    deliverySnapshot: 'Delivery snapshot',
    noShipments: 'No shipments recorded yet.',
    pickupStation: 'Pickup station',
    doorDelivery: 'Door delivery',
    visitors: 'Website visitors, last 30 days',
    pageViews: 'Page views',
    uniqueVisitors: 'Visitors',
    topPages: 'Top pages',
    noVisits: 'No visits recorded yet — this fills in as people browse the site.',
    orderCountOne: '{count} order',
    orderCountMany: '{count} orders',
    visitCountOne: '{count} visit',
    visitCountMany: '{count} visits',
    visitorCountOne: '{count} visitor',
    visitorCountMany: '{count} visitors',
    jumpTo: 'Jump to',
    recentOrders: 'Recent orders',
    viewAll: 'View all',
    noOrdersTitle: 'No orders yet',
    noOrdersBody:
      'Real orders placed through checkout will show up here as soon as the first one lands.',
    quickLinks: {
      '/admin/orders': 'Every order, oldest to newest',
      '/admin/products': 'Manage boxes and pricing',
      '/admin/deliveries': 'Track every shipment',
      '/admin/withdrawals': 'Creator payout requests',
    },
    table: {
      customer: 'Customer',
      total: 'Total',
      status: 'Status',
      placed: 'Placed',
    },
  },

  orders: {
    title: 'Orders',
    subtitle: 'Every paid order — placed on the website, over WhatsApp, or taken by staff.',
    searchLabel: 'Search by customer name or phone number',
    search: 'Search',
    clear: 'Clear',
    all: 'All',
    loadMore: 'Load more',
  },

  orderStatus: {
    pending: 'Pending',
    confirmed: 'Confirmed',
    dispatched: 'Dispatched',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    refund_requested: 'Refund requested',
    refunded: 'Refunded',
  },

  analytics: {
    websiteFunnel: 'Website funnel (last {days} days)',
    whatsappFunnel: 'WhatsApp conversation funnel',
    stages: {
      visited: 'Visited the site',
      reachedCheckout: 'Reached the checkout',
      sawTotal: 'Saw their delivery total',
      pressedPay: 'Pressed “Pay with M-Pesa”',
      paid: 'Paid',
    },
  },
} as const;

/**
 * Widens every leaf to `string` while keeping the exact key shape.
 *
 * `as const` above makes each English value its own literal type,
 * which is right for `en` and useless for a translation — without this
 * a Chinese label would fail to compile purely for not being the
 * English words. What must still be enforced is the *shape*: a key
 * this has and a translation lacks, or one a translation invents, is
 * the error worth catching.
 */
type Translated<T> = {
  [K in keyof T]: T[K] extends string ? string : Translated<T[K]>;
};

/**
 * The shape every other language must match. Derived from English so
 * the two can never drift apart unnoticed.
 */
export type Dictionary = Translated<typeof en>;
