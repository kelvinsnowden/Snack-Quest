import type { Timestamp } from 'firebase/firestore';

export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'whatsapp';
export type NotificationRecipientType = 'creator' | 'customer' | 'staff';

/**
 * `notifications/{notificationId}` — scoped per recipient, unlike the
 * current unreadable-at-scale log. TDD §8. Rules §9 allow the recipient
 * to update only the `read` field.
 */
export interface Notification {
  recipientId: string;
  recipientType: NotificationRecipientType;
  channel: NotificationChannel;
  templateCode: string;
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: Timestamp;
}
