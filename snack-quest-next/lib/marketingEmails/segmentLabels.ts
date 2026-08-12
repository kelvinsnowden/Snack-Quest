import type { MarketingEmailSegment } from '@/types';

/** Human-readable segment labels — shared by the history table and the sent-campaign detail view, so both agree on wording. */
export const SEGMENT_LABEL: Record<MarketingEmailSegment, string> = {
  all_creators: 'All creators',
  active_creators: 'Active creators',
  pending_creators: 'Pending creators',
  suspended_creators: 'Suspended creators',
  no_sale_creators: 'No sale yet',
  first_sale_creators: 'Made their first sale',
  repeat_creators: 'Repeat sellers',
  new_creators: 'New creators',
  specific_creators: 'Specific creators',
  custom: 'Custom list',
};
