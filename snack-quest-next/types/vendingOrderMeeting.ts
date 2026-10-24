import type { Timestamp } from 'firebase/firestore';

/**
 * `vendingOrderMeetings/{id}` — a meeting a prospective machine owner
 * booked from the public `/meet` page, to talk it through and place
 * their order (§ order meetings).
 *
 * One per WhatsApp number (doc id `meet_<2547…>`): booking again with
 * the same number moves the meeting rather than adding a second one.
 * The page is public and linked from an email sent to every lead, so a
 * booking may come from someone not yet in `vendingLeads`; `leadId` is
 * set when the number or email matched a lead at booking time.
 *
 * Names and phone numbers, so the security rule denies every client
 * read and write; the Admin SDK is the only reader and writer.
 */
export type OrderMeetingMode = 'in_person' | 'video_call';

export const ORDER_MEETING_MODES: readonly { value: OrderMeetingMode; label: string }[] = [
  { value: 'in_person', label: 'In person, in Nairobi' },
  { value: 'video_call', label: 'Video call' },
] as const;

export interface OrderMeetingReminders {
  dayBeforeAtMs: number | null;
  hourBeforeAtMs: number | null;
}

export type OrderMeetingReminderKind = 'dayBefore' | 'hourBefore';

export interface VendingOrderMeeting {
  fullName: string;
  /** `2547XXXXXXXX`. */
  phone: string;
  email: string | null;
  /** Where they would put the machine, in their own words. */
  location: string;
  mode: OrderMeetingMode;
  /** Start of the meeting, epoch ms. */
  atMs: number;
  bookedAtMs: number;
  leadId: string | null;
  /**
   * When each reminder text went out (epoch ms), so none is sent twice.
   * Cleared whenever the meeting moves to a new time. Absent on meetings
   * booked before reminders existed, which reads as "none sent yet".
   */
  reminders?: OrderMeetingReminders | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
