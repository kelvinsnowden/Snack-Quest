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
      '/admin/fulfillment-batches': '批次',
      '/admin/recipes': '配方',
      '/admin/marketing-sms': '短信',
      '/admin/sms-opt-outs': '退订',
    },
  },

  dashboard: {
    welcome: '欢迎回来，{name}',
    subtitle: '以下是 {business} 的最新情况。',
    revenue30: '营收（30 天）',
    totalOrders: '订单总数',
    awaitingAgent: '等待人工客服',
    staffMembers: '员工人数',
    revenueChart: '营收趋势（最近 30 天）',
    deliverySnapshot: '配送概况',
    visitors: '网站访客（最近 30 天）',
    jumpTo: '快速跳转',
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
