/**
 * Human-readable event names for the real `notificationTemplates`
 * catalog (§ Admin: Notification Templates) — `templateCode` itself is
 * the correct thing to store and look up by, but nobody staff-facing
 * should have to read `creator_status_approved_email` to know that's
 * the "Creator approved" email. Falls back to the raw code for any
 * template this map hasn't been extended for yet, so a newly-seeded
 * code is never invisible — just unlabeled until this map catches up.
 */
export const TEMPLATE_EVENT_LABEL: Record<string, string> = {
  creator_registered_welcome_email: 'Creator registration — welcome email',
  creator_status_approved_email: 'Creator approved — welcome email',
  referral_commission_earned_email: 'Commission earned',
  withdrawal_approved_email: 'Withdrawal approved',
  staff_invited_email: 'Staff invited',
  creator_status_approved_sms: 'Creator approved (SMS)',
  creator_status_rejected_sms: 'Creator application rejected (SMS)',
  referral_commission_earned_sms: 'Commission earned (SMS)',
  withdrawal_approved_sms: 'Withdrawal approved (SMS)',
  withdrawal_paid_sms: 'Withdrawal paid (SMS)',
  withdrawal_rejected_sms: 'Withdrawal rejected (SMS)',
  withdrawal_failed_sms: 'Withdrawal failed (SMS)',
  refund_succeeded_sms: 'Refund processed (SMS)',
};

export function templateEventLabel(templateCode: string): string {
  return TEMPLATE_EVENT_LABEL[templateCode] ?? templateCode;
}
