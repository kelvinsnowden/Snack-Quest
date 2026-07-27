import { DatabaseState, Customer, Order, WalletTransaction, AuditLog } from '../types/database';

export interface CreatorProfile {
  customer_id: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  tiktok_handle: string;
  instagram_handle: string;
  youtube_handle: string;
  follower_count: number;
  favorite_snack_categories: string[];
  is_verified_creator: boolean;
  tier: 'Explorer' | 'Bronze' | 'Silver' | 'Gold' | 'Diamond' | 'Legend';
  streak_days: number;
  last_active_date: string;
  created_at: string;
  updated_at: string;
}

export interface AffiliateWithdrawalRequest {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  amount_cents: number;
  amount_kes: number;
  method: 'mpesa' | 'bank';
  account_number: string;
  bank_name?: string;
  notes?: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid' | 'cancelled';
  fraud_score: number; // 0 to 100
  fraud_flags: string[];
  admin_notes?: string;
  requested_at: string;
  approved_at?: string;
  paid_at?: string;
  rejected_at?: string;
  rejection_reason?: string;
  payment_reference?: string;
  updated_at: string;
}

export interface CustomerDeviceSession {
  id: string;
  customer_id: string;
  device_name: string;
  ip_address: string;
  location: string;
  user_agent: string;
  last_login_at: string;
  is_current: boolean;
}

export interface CreatorAnalytics {
  visitors_today: number;
  link_clicks: number;
  whatsapp_starts: number;
  purchases_count: number;
  conversion_rate_pct: number;
  revenue_generated_cents: number;
  revenue_generated_kes: number;
  commission_earned_cents: number;
  commission_earned_kes: number;
  best_day: string;
  best_month: string;
  top_products_sold: { name: string; count: number }[];
  monthly_chart: { month: string; earnings_kes: number; referrals_count: number }[];
}

// 1. Calculate Creator Tier & Perks
export function calculateCreatorTier(lifetimeEarnedKes: number, totalReferrals: number) {
  if (lifetimeEarnedKes >= 50000 || totalReferrals >= 100) {
    return {
      tier: 'Legend' as const,
      perks: ['2.5x Commission Multiplier', 'Exclusive Custom Snack Box', 'VIP Event Passes', 'Dedicated Affiliate Manager', '1-Hour Payout SLA'],
      nextThresholdKes: 100000,
      badge: '👑'
    };
  } else if (lifetimeEarnedKes >= 25000 || totalReferrals >= 50) {
    return {
      tier: 'Diamond' as const,
      perks: ['2x Commission Multiplier', 'Early Access to New Releases', 'Free Monthly Sample Box', 'Priority Payouts'],
      nextThresholdKes: 50000,
      badge: '💎'
    };
  } else if (lifetimeEarnedKes >= 10000 || totalReferrals >= 20) {
    return {
      tier: 'Gold' as const,
      perks: ['1.5x Commission Multiplier', 'Exclusive Promo Codes', 'Featured Creator Spot'],
      nextThresholdKes: 25000,
      badge: '🥇'
    };
  } else if (lifetimeEarnedKes >= 5000 || totalReferrals >= 10) {
    return {
      tier: 'Silver' as const,
      perks: ['1.2x Commission Multiplier', 'Free Snack Swag Pack'],
      nextThresholdKes: 10000,
      badge: '🥈'
    };
  } else if (lifetimeEarnedKes >= 2000 || totalReferrals >= 4) {
    return {
      tier: 'Bronze' as const,
      perks: ['Standard Commission', 'Creator Badge'],
      nextThresholdKes: 5000,
      badge: '🥉'
    };
  }
  return {
    tier: 'Explorer' as const,
    perks: ['Standard KSh 500 per Referral', 'Shareable Links & QR Codes'],
    nextThresholdKes: 2000,
    badge: '🚀'
  };
}

// 2. Fraud Score Calculation Engine
export function calculateFraudScore(
  customer: Customer,
  orders: Order[],
  allCustomers: Customer[],
  withdrawalAmountCents: number
): { score: number; flags: string[] } {
  let score = 0;
  const flags: string[] = [];

  // Check 1: Self referral / Duplicate Phone or Email
  const dupes = allCustomers.filter(
    (c) => c.id !== customer.id && (c.phone === customer.phone || (c.email && c.email === customer.email))
  );
  if (dupes.length > 0) {
    score += 40;
    flags.push('Multiple accounts associated with same phone/email address');
  }

  // Check 2: Unusually high cancellation rate on referred orders
  const customerOrders = orders.filter((o) => o.customer_id === customer.id);
  const cancelledOrders = customerOrders.filter((o) => o.order_status === 'cancelled');
  if (customerOrders.length > 2 && cancelledOrders.length / customerOrders.length > 0.5) {
    score += 30;
    flags.push('High order cancellation rate (>50%)');
  }

  // Check 3: Sudden high withdrawal request with zero completed delivered orders
  const deliveredOrders = customerOrders.filter((o) => o.order_status === 'delivered');
  if (withdrawalAmountCents > 500000 && deliveredOrders.length === 0) {
    score += 25;
    flags.push('Large withdrawal requested with no completed delivered orders');
  }

  // Check 4: Blacklisted or dormant flag
  if (customer.status === 'blacklisted') {
    score += 100;
    flags.push('Account is blacklisted in CRM');
  }

  return {
    score: Math.min(100, score),
    flags
  };
}

// 3. Generate Mock Analytics for Creator Insights
export function getCreatorAnalytics(customer: Customer, orders: Order[]): CreatorAnalytics {
  const custOrders = orders.filter((o) => o.customer_id === customer.id);
  const delivered = custOrders.filter((o) => o.order_status === 'delivered');

  const totalRevenueCents = delivered.reduce((s, o) => s + o.final_amount_paid, 0);
  const totalClicks = Math.max(custOrders.length * 12 + customer.total_referrals * 24, 42);
  const whatsappStarts = Math.max(Math.round(totalClicks * 0.45), 18);
  const purchases = Math.max(customer.total_referrals, delivered.length);
  const convRate = totalClicks > 0 ? Math.round((purchases / totalClicks) * 1000) / 10 : 0;

  const commissionCents = customer.total_referrals * 50000;

  return {
    visitors_today: Math.floor(12 + Math.random() * 35),
    link_clicks: totalClicks,
    whatsapp_starts: whatsappStarts,
    purchases_count: purchases,
    conversion_rate_pct: convRate,
    revenue_generated_cents: totalRevenueCents,
    revenue_generated_kes: Math.round(totalRevenueCents / 100),
    commission_earned_cents: commissionCents,
    commission_earned_kes: Math.round(commissionCents / 100),
    best_day: 'Saturdays',
    best_month: 'July 2026',
    top_products_sold: [
      { name: 'Nairobi Gourmet Snack Box', count: Math.max(12, purchases) },
      { name: 'Swahili Coast Chili Nuts Pack', count: Math.max(8, Math.round(purchases * 0.6)) },
      { name: 'Rift Valley Honey Crunchy Mix', count: Math.max(5, Math.round(purchases * 0.4)) }
    ],
    monthly_chart: [
      { month: 'Feb', earnings_kes: 1500, referrals_count: 3 },
      { month: 'Mar', earnings_kes: 3000, referrals_count: 6 },
      { month: 'Apr', earnings_kes: 2500, referrals_count: 5 },
      { month: 'May', earnings_kes: 6000, referrals_count: 12 },
      { month: 'Jun', earnings_kes: 8500, referrals_count: 17 },
      { month: 'Jul', earnings_kes: Math.round(commissionCents / 100), referrals_count: purchases }
    ]
  };
}
