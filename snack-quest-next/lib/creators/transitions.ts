import type { CreatorStatus } from '@/types';

/**
 * Admin: Creators status actions (§ Admin: Creators). A brand-new
 * signup starts `pending`; an admin approves into `active` or rejects
 * into `suspended`, and either active or suspended creators can be
 * moved to the other — there is no terminal state, unlike orders,
 * since a suspension is always reversible by an admin.
 */
export const VALID_CREATOR_TRANSITIONS: Record<CreatorStatus, CreatorStatus[]> = {
  pending: ['active', 'suspended'],
  active: ['suspended'],
  suspended: ['active'],
};

export const CREATOR_STATUS_LABELS: Record<CreatorStatus, string> = {
  pending: 'Pending review',
  active: 'Active',
  suspended: 'Suspended',
};
