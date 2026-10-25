import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';

const sent = vi.hoisted(() => [] as { to: string; subject: string }[]);
const texts = vi.hoisted(() => [] as { to: string; body: string }[]);
vi.mock('@/lib/integrations/sms/textSmsGateway', () => ({
  textSmsGateway: {
    send: vi.fn(async (input: { to: string; body: string }) => {
      texts.push({ to: input.to, body: input.body });
      return { providerMessageId: 'test' };
    }),
  },
}));
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
  texts.length = 0;
  for (const collection of ['vendingLeads', 'vendingOrderMeetings', 'vendingOrderMeetingSlots']) {
    const snapshot = await adminFirestore.collection(collection).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
});

describe('orderMeetingService.book', () => {
  it('books the time, and confirms to the person and the team by email and text', async () => {
    await orderMeetingService.book(booking(), NOW);
    const meeting = await meetingOf('meet_254712345678');
    expect(meeting?.atMs).toBe(SLOT);
    expect(meeting?.phone).toBe('254712345678');
    expect(meeting?.leadId).toBeNull();
    expect(sent.map((email) => email.to).sort()).toEqual(['amina@example.com', 'support@snackquests.shop']);
    expect(texts.map((text) => text.to).sort()).toEqual(['254712345678', '254759209705']);
    const founder = texts.find((text) => text.to === '254759209705')!.body;
    expect(founder).toContain('New order meeting: Amina Wanjiru');
    expect(founder).toContain('+254712345678');
    const confirmation = texts.find((text) => text.to === '254712345678')!.body;
    expect(confirmation).toContain("you're booked");
    expect(confirmation).toContain('10:00');
  });

  it('keeps the booking when a text fails', async () => {
    const { textSmsGateway } = await import('@/lib/integrations/sms/textSmsGateway');
    vi.mocked(textSmsGateway.send).mockRejectedValueOnce(new Error('TextSMS down'));
    await orderMeetingService.book(booking(), NOW);
    expect((await meetingOf('meet_254712345678'))?.atMs).toBe(SLOT);
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

describe('orderMeetingService.sendDueReminders', () => {
  // Booked on 23 Oct for Monday 2 Nov 10:00.
  const DAY_BEFORE = SLOT - 23 * 60 * 60 * 1000; // Sunday 11:00, inside the day-before window
  const HOUR_BEFORE = SLOT - 50 * 60 * 1000; // Monday 09:10

  async function bookAndClear() {
    await orderMeetingService.book(booking(), NOW);
    texts.length = 0;
  }

  it('sends nothing for a meeting more than a day away', async () => {
    await bookAndClear();
    expect(await orderMeetingService.sendDueReminders(SLOT - 30 * 60 * 60 * 1000)).toEqual({ dayBefore: 0, hourBefore: 0, failed: 0 });
    expect(texts).toEqual([]);
  });

  it('sends the day-before text once, then the hour-before text once', async () => {
    await bookAndClear();
    expect(await orderMeetingService.sendDueReminders(DAY_BEFORE)).toMatchObject({ dayBefore: 1 });
    expect(await orderMeetingService.sendDueReminders(DAY_BEFORE + 10 * 60 * 1000)).toMatchObject({ dayBefore: 0 });
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatchObject({ to: '254712345678' });
    expect(texts[0].body).toContain('reminder');

    expect(await orderMeetingService.sendDueReminders(HOUR_BEFORE)).toMatchObject({ hourBefore: 1 });
    expect(await orderMeetingService.sendDueReminders(HOUR_BEFORE + 5 * 60 * 1000)).toMatchObject({ hourBefore: 0 });
    expect(texts).toHaveLength(2);
    expect(texts[1].body).toContain('see you at 10:00 today');
  });

  it('skips a late day-before text once the hour-before one has gone', async () => {
    await bookAndClear();
    await orderMeetingService.sendDueReminders(HOUR_BEFORE);
    await orderMeetingService.sendDueReminders(HOUR_BEFORE + 60_000);
    expect(texts).toHaveLength(1);
    expect(texts[0].body).toContain('today');
  });

  it('sends no day-before text to someone who booked within a day of it', async () => {
    const lateBooking = SLOT - 25 * 60 * 60 * 1000; // Sunday 09:00, just over the day's notice
    await orderMeetingService.book(booking(), lateBooking);
    texts.length = 0;
    expect(await orderMeetingService.sendDueReminders(DAY_BEFORE)).toMatchObject({ dayBefore: 0 });
    expect(await orderMeetingService.sendDueReminders(HOUR_BEFORE)).toMatchObject({ hourBefore: 1 });
  });

  it('starts the reminders over when the meeting moves', async () => {
    await bookAndClear();
    await orderMeetingService.sendDueReminders(DAY_BEFORE);
    await orderMeetingService.book(booking({ atMs: LATER }), NOW);
    expect((await meetingOf('meet_254712345678'))?.reminders).toEqual({ dayBeforeAtMs: null, hourBeforeAtMs: null });
  });

  it('puts the claim back when the text fails, so the next run retries', async () => {
    await bookAndClear();
    const { textSmsGateway } = await import('@/lib/integrations/sms/textSmsGateway');
    vi.mocked(textSmsGateway.send).mockRejectedValueOnce(new Error('TextSMS down'));
    expect(await orderMeetingService.sendDueReminders(DAY_BEFORE)).toMatchObject({ failed: 1 });
    expect(await orderMeetingService.sendDueReminders(DAY_BEFORE + 5 * 60 * 1000)).toMatchObject({ dayBefore: 1 });
  });
});
