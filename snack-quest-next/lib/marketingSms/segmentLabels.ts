import type { MarketingSmsSegment } from '@/types';
import {
  HIGH_VALUE_CUSTOMER_THRESHOLD_KES,
  LAPSED_CUSTOMER_DAYS,
  RECENT_CUSTOMER_DAYS,
} from '@/types/marketingSms';

/** Short names for the segment picker and the campaigns table. */
export const SMS_SEGMENT_LABEL: Record<MarketingSmsSegment, string> = {
  all_customers: 'All customers',
  recent_customers: 'Recent customers',
  lapsed_customers: 'Lapsed customers',
  repeat_customers: 'Repeat customers',
  one_time_customers: 'One-time customers',
  high_value_customers: 'High-value customers',
  custom: 'Custom list',
};

/**
 * What each segment actually means, in the composer.
 *
 * Spelled out rather than left to the name because the thresholds are
 * arbitrary decisions, not common knowledge — "lapsed" could plausibly
 * mean 30 days or 180, and someone about to spend money on a win-back
 * campaign needs to know which. Derived from the same constants the
 * service filters by, so the description cannot drift from the query.
 */
export const SMS_SEGMENT_DESCRIPTION: Record<MarketingSmsSegment, string> = {
  all_customers: 'Everyone who has ever placed an order.',
  recent_customers: `Ordered in the last ${RECENT_CUSTOMER_DAYS} days.`,
  lapsed_customers: `Has not ordered for ${LAPSED_CUSTOMER_DAYS} days or more.`,
  repeat_customers: 'Has ordered two or more times.',
  one_time_customers: 'Has ordered exactly once.',
  high_value_customers: `Has spent KES ${HIGH_VALUE_CUSTOMER_THRESHOLD_KES.toLocaleString()} or more in total.`,
  custom: 'Numbers you paste in yourself.',
};

export const SMS_SEGMENTS: MarketingSmsSegment[] = [
  'all_customers',
  'recent_customers',
  'lapsed_customers',
  'repeat_customers',
  'one_time_customers',
  'high_value_customers',
  'custom',
];
