import type { Dictionary } from './en';

/**
 * Simplified Chinese (§ Admin in Simplified Chinese).
 *
 * Typed as `Dictionary`, so a key that English has and this does not
 * — or one this invents — is a compile error. That is the whole
 * mechanism keeping the two files honest as the portal grows.
 *
 * Business vocabulary follows what is standard in mainland Chinese
 * commerce software rather than a literal rendering: 订单 for orders,
 * 履约 for fulfilment, 对账 for reconciliation, 提现 for withdrawals,
 * 达人 for the creator/influencer sense rather than 创作者, which reads
 * as an artist. Product names stay untranslated — M-Pesa, WhatsApp and
 * Snack Quest are what they are called in every language.
 */
export const zhCN: Dictionary = {
  language: {
    label: '语言',
    switchTo: '切换语言',
  },

  nav: {
    admin: '管理后台',
    navigation: '后台导航',
    groups: {
      Overview: '概览',
      'Orders & delivery': '订单与配送',
      'Catalogue & stock': '商品与库存',
      Customers: '客户',
      Creators: '达人',
      Money: '财务',
      Marketing: '营销',
      System: '系统',
    },
    items: {
      '/admin': '仪表盘',
      '/admin/analytics': '数据分析',
      '/admin/orders': '订单',
      '/admin/deliveries': '配送',
      '/admin/fulfillment-batches': '履约批次',
      '/admin/delivery-zones': '配送区域',
      '/admin/fulfilment-costs': '履约成本',
      '/admin/products': '商品',
      '/admin/inventory': '库存',
      '/admin/snack-items': '零食',
      '/admin/recipes': '礼盒配方',
      '/admin/purchase-orders': '采购单',
      '/admin/suppliers': '供应商',
      '/admin/conversations': '会话',
      '/admin/customers': '客户',
      '/admin/reviews': '评价',
      '/admin/creators': '达人',
      '/admin/campaigns': '活动',
      '/admin/referrals': '推荐',
      '/admin/withdrawals': '提现',
      '/admin/reconciliation': '对账',
      '/admin/discount-codes': '优惠码',
      '/admin/faqs': '常见问题',
      '/admin/marketing-emails': '营销邮件',
      '/admin/marketing-sms': '营销短信',
      '/admin/sms-opt-outs': '短信退订',
      '/admin/notification-templates': '通知模板',
      '/admin/storage': '文件存储',
      '/admin/operations': '运维',
      '/admin/audit-logs': '操作日志',
      '/admin/staff': '员工',
      '/admin/settings': '设置',
    },
    shortItems: {
      '/admin/fulfilment-costs': '成本',
      '/admin/fulfillment-batches': '批次',
      '/admin/recipes': '配方',
      '/admin/marketing-sms': '短信',
      '/admin/sms-opt-outs': '退订',
    },
  },

  search: {
    trigger: '搜索…',
    label: '搜索',
    typeMore: '请输入至少 2 个字符开始搜索。',
    noResults: '没有找到与“{query}”相关的结果。',
    placeholder: '搜索订单、客户、商品、供应商、会话…',
  },

  dashboard: {
    welcome: '欢迎回来，{name}',
    subtitle: '以下是 {business} 的最新情况。',
    noAccess: '您没有“{section}”的访问权限。如需使用，请联系超级管理员。',
    revenue30: '营收（30 天）',
    totalOrders: '订单总数',
    awaitingAgent: '等待人工客服',
    staffMembers: '员工人数',
    revenueUp: '营收较前 30 天上升 {percent}%',
    revenueDown: '营收较前 30 天下降 {percent}%',
    revenueDeltaMore: '（比上一周期多 {amount}）',
    revenueDeltaLess: '（比上一周期少 {amount}）',
    revenueChart: '营收趋势（最近 30 天）',
    deliverySnapshot: '配送概况',
    noShipments: '暂无配送记录。',
    pickupStation: '自提点',
    doorDelivery: '送货上门',
    visitors: '网站访客（最近 30 天）',
    pageViews: '浏览量',
    uniqueVisitors: '访客数',
    topPages: '热门页面',
    noVisits: '暂无访问记录 —— 有人浏览网站后，这里会自动填充。',
    orderCountOne: '{count} 笔订单',
    orderCountMany: '{count} 笔订单',
    visitCountOne: '{count} 次访问',
    visitCountMany: '{count} 次访问',
    visitorCountOne: '{count} 位访客',
    visitorCountMany: '{count} 位访客',
    jumpTo: '快速跳转',
    recentOrders: '最近订单',
    viewAll: '查看全部',
    noOrdersTitle: '暂无订单',
    noOrdersBody: '通过结算页完成的真实订单，会在第一笔到达后显示在这里。',
    quickLinks: {
      '/admin/orders': '全部订单，按时间先后排列',
      '/admin/products': '管理礼盒与定价',
      '/admin/deliveries': '跟踪每一笔配送',
      '/admin/withdrawals': '达人提现申请',
    },
    table: {
      customer: '客户',
      total: '金额',
      status: '状态',
      placed: '下单时间',
    },
  },

  orders: {
    title: '订单',
    subtitle: '所有已付款订单 —— 来自网站、WhatsApp 或由员工代下单。',
    searchLabel: '按客户姓名或手机号搜索',
    search: '搜索',
    clear: '清除',
    all: '全部',
    loadMore: '加载更多',
  },

  orderStatus: {
    pending: '待处理',
    confirmed: '已确认',
    dispatched: '已发货',
    delivered: '已送达',
    cancelled: '已取消',
    refund_requested: '申请退款',
    refunded: '已退款',
  },

  analytics: {
    websiteFunnel: '网站转化漏斗（最近 {days} 天）',
    whatsappFunnel: 'WhatsApp 会话漏斗',
    stages: {
      visited: '访问网站',
      reachedCheckout: '进入结算页',
      sawTotal: '看到配送总价',
      pressedPay: '点击“使用 M-Pesa 付款”',
      paid: '完成付款',
    },
  },
};
