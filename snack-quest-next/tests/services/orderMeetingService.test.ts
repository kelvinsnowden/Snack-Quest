import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';

const sent = vi.hoisted(() => [] as { to: string; subject: string }[]);
vi.mock('@/lib/integrations/email/smtpEmailGateway', () => ({
  smtpEmailGateway: {
    send: vi.fn(async (input: { to: string; subject: string }) => {
      sent.push({ to: input.to, subject: input.subject });
      return { providerMessageId: 'test' };
    }),
  },
}));

import {
  MeetingSlotTakenError,
  OrderMeetingValidationError,
  orderMeetingService,
} from '@/services/orderMeetingService';
import type { VendingLead } from '@/types/vendingLead';
import type { VendingOrderMeeting } from '@/types/vendingOrderMeeting';

/** § order meetings — against the Firestore emulator, with email sending faked. */

const NOW = Date.parse('2026-10-23T09:00:00+03:00'); // Friday
const SLOT = Date.parse('2026-11-02T10:00:00+03:00'); // Monday 10:00
const SAME_DAY = Date.parse('2026-11-02T14:00:00+03:00'); // Monday 14:00
const LATER = Date.parse('2026-11-04T14:00:00+03:00'); // Wednesday 14:00 (Tuesday is blocked)

const booking = (extra: Record<string, unknown> = {}) => ({
  fullName: 'Amina Wanjiru',
  whatsapp: '0712 345 678',
  email: 'amina@example.com',
  location: 'Student hostel in Madaraka',
  mode: 'in_person',
  atMs: SLOT,
  ...extra,
});

async function seedLead(id: string, extra: Partial<VendingLead> = {}) {
  await adminFirestore.collection('vendingLeads').doc(id).set({
    source: 'meta_sheet',
    externalId: id,
    fullName: 'Amina Wanjiru',
    phone: '254712345678',
    email: null,
    campaignName: null,
    adName: null,
    formName: null,
    platform: null,
    answers: [],
    submittedAtMs: NOW,
    status: 'new',
    segment: 'investor',
    notes: [],
    nextFollowUpAtMs: null,
    ...extra,
  });
}

const meetingOf = async (id: string) =>
  (await adminFirestore.collection('vendingOrderMeetings').doc(id).get()).data() as VendingOrderMeeting | undefined;

beforeEach(async () => {
  sent.length = 0;
  for (const collection of ['vendingLeads', 'vendingOrderMeetings', 'vendingOrderMeetingSlots']) {
    const snapshot = await adminFirestore.collection(collection).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
});

describe('orderMeetingService.book', () => {
  it('books the time, and confirms to the person and the team', async () => {
    await orderMeetingService.book(booking(), NOW);
    const meeting = await meetingOf('meet_254712345678');
    expect(meeting?.atMs).toBe(SLOT);
    expect(meeting?.phone).toBe('254712345678');
    expect(meeting?.leadId).toBeNull();
    expect(sent.map((email) => email.to).sort()).toEqual(['amina@example.com', 'support@snackquests.shop']);
  });

  it('allows one meeting a day: refuses the same time, and any other time that day', async () => {
    await orderMeetingService.book(booking(), NOW);
    await expect(orderMeetingService.book(booking({ whatsapp: '0722 000 111' }), NOW)).rejects.toBeInstanceOf(
      MeetingSlotTakenError,
    );
    await expect(
      orderMeetingService.book(booking({ whatsapp: '0722 000 111', atMs: SAME_DAY }), NOW),
    ).rejects.toBeInstanceOf(MeetingSlotTakenError);
    const monday = (await orderMeetingService.bookingDays(NOW)).find((day) => day.date === '2026-11-02');
    expect(monday).toEqual({ date: '2026-11-02', slots: [], booked: true });
  });

  it('lets the same number change the time within its own day', async () => {
    await orderMeetingService.book(booking(), NOW);
    await orderMeetingService.book(booking({ atMs: SAME_DAY }), NOW);
    expect((await meetingOf('meet_254712345678'))?.atMs).toBe(SAME_DAY);
  });

  it('moves the meeting when the same number books another day, and frees the old day', async () => {
    await orderMeetingService.book(booking(), NOW);
    await orderMeetingService.book(booking({ atMs: LATER }), NOW);
    expect((await meetingOf('meet_254712345678'))?.atMs).toBe(LATER);
    const days = await orderMeetingService.bookingDays(NOW);
    expect(days.find((day) => day.date === '2026-11-02')).toMatchObject({ booked: false });
    expect(days.find((day) => day.date === '2026-11-02')?.slots).toContain(SLOT);
    expect(days.find((day) => day.date === '2026-11-04')).toEqual({ date: '2026-11-04', slots: [], booked: true });
  });

  it('counts a booking filed under its start time, from before one meeting a day', async () => {
    await adminFirestore.collection('vendingOrderMeetingSlots').doc(String(SLOT)).set({ meetingId: 'meet_254700000000', atMs: SLOT });
    expect((await orderMeetingService.bookingDays(NOW)).find((day) => day.date === '2026-11-02')?.booked).toBe(true);
    await expect(orderMeetingService.book(booking({ atMs: SAME_DAY }), NOW)).rejects.toBeInstanceOf(MeetingSlotTakenError);
  });

  it('refuses a day blocked by hand', async () => {
    await expect(
      orderMeetingService.book(booking({ atMs: Date.parse('2026-11-03T10:00:00+03:00') }), NOW),
    ).rejects.toBeInstanceOf(OrderMeetingValidationError);
  });

  it('attaches the meeting to the lead with that number', async () => {
    await seedLead('meta_a');
    await orderMeetingService.book(booking(), NOW);
    expect((await meetingOf('meet_254712345678'))?.leadId).toBe('meta_a');
    const lead = (await adminFirestore.collection('vendingLeads').doc('meta_a').get()).data() as VendingLead;
    expect(lead.status).toBe('site_visit');
    expect(lead.nextFollowUpAtMs).toBe(SLOT);
    expect(lead.nurture?.stoppedReason).toBe('booked');
    expect(lead.notes.at(-1)?.text).toContain('order meeting');
  });

  it('rejects a time that isn’t offered, a bad number, and a missing location', async () => {
    await expect(orderMeetingService.book(booking({ atMs: SLOT + 30 * 60 * 1000 }), NOW)).rejects.toBeInstanceOf(
      OrderMeetingValidationError,
    );
    await expect(orderMeetingService.book(booking({ whatsapp: '12345' }), NOW)).rejects.toBeInstanceOf(
      OrderMeetingValidationError,
    );
    await expect(orderMeetingService.book(booking({ location: '  ' }), NOW)).rejects.toBeInstanceOf(
      OrderMeetingValidationError,
    );
    expect(await meetingOf('meet_254712345678')).toBeUndefined();
  });
});
