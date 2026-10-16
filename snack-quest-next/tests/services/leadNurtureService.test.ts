import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

import { leadNurtureService, CallSlotTakenError } from '@/services/leadNurtureService';
import { DEFAULT_NURTURE_SEQUENCE as NURTURE_SEQUENCE } from '@/lib/leads/nurtureSequence';
import type { VendingLead } from '@/types/vendingLead';

/** § lead nurture — against the Firestore emulator, with email sending faked. */

const NOW = Date.parse('2026-10-16T08:00:00+03:00'); // Friday
const SLOT = Date.parse('2026-10-19T10:00:00+03:00'); // Monday 10:00
const DAY = 24 * 60 * 60 * 1000;

async function seedLead(id: string, extra: Partial<VendingLead> = {}) {
  await adminFirestore.collection('vendingLeads').doc(id).set({
    source: 'meta_sheet',
    externalId: id,
    fullName: 'Amina Wanjiru',
    phone: '254712345678',
    email: `${id}@example.com`,
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

const leadOf = async (id: string) => (await adminFirestore.collection('vendingLeads').doc(id).get()).data() as VendingLead;

beforeAll(() => {
  process.env.LEAD_NURTURE_ENABLED = 'true';
  process.env.LEAD_LINK_SECRET = 'test-secret';
});
afterAll(() => {
  delete process.env.LEAD_NURTURE_ENABLED;
  delete process.env.LEAD_LINK_SECRET;
});

beforeEach(async () => {
  sent.length = 0;
  for (const collection of ['vendingLeads', 'vendingLeadCalls', 'leadNurtureSettings']) {
    const snapshot = await adminFirestore.collection(collection).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
});

describe('leadNurtureService.runDue', () => {
  it('sends the welcome email once, however many times it runs', async () => {
    await seedLead('meta_a');
    await leadNurtureService.runDue(NOW);
    await leadNurtureService.runDue(NOW + 60_000);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe(NURTURE_SEQUENCE[0].subject);
    expect((await leadOf('meta_a')).nurture?.sent).toBe(1);
  });

  it('sends nothing when turned off', async () => {
    await seedLead('meta_a');
    process.env.LEAD_NURTURE_ENABLED = 'false';
    await leadNurtureService.runDue(NOW);
    process.env.LEAD_NURTURE_ENABLED = 'true';
    expect(sent).toHaveLength(0);
  });

  it('skips leads that unsubscribed, have no email, or are already further along', async () => {
    await seedLead('meta_optout', { emailOptOutAtMs: NOW - DAY });
    await seedLead('meta_noemail', { email: null });
    await seedLead('meta_won', { status: 'won' });
    await leadNurtureService.runDue(NOW);
    expect(sent).toHaveLength(0);
  });

  it('marks the sequence finished after the last email', async () => {
    await seedLead('meta_a');
    for (let day = 0; day <= 20; day += 1) await leadNurtureService.runDue(NOW + day * DAY);
    expect(sent).toHaveLength(NURTURE_SEQUENCE.length);
    expect((await leadOf('meta_a')).nurture?.stoppedReason).toBe('finished');
  });
});

describe('edited sequence', () => {
  it('sends the saved emails instead of the built-in ones', async () => {
    await leadNurtureService.saveSequence(
      [{ day: 0, subject: 'Custom hello', heading: 'Hi {firstName}', body: 'Text', ctaLabel: 'Book', imageUrl: null }],
      'Kelvin',
    );
    await seedLead('meta_a');
    await leadNurtureService.runDue(NOW);
    expect(sent.map((email) => email.subject)).toEqual(['Custom hello']);
    expect((await leadOf('meta_a')).nurture?.stoppedReason).toBe('finished');
  });

  it('refuses a sequence that fails validation', async () => {
    await expect(leadNurtureService.saveSequence([], 'Kelvin')).rejects.toThrow('Keep at least one email.');
  });
});

describe('leadNurtureService.bookCall', () => {
  it('books the slot, stops the emails, and confirms to the lead and the team', async () => {
    await seedLead('meta_a');
    await leadNurtureService.bookCall('meta_a', { atMs: SLOT, whatsapp: '0722 000 111' }, NOW);
    const lead = await leadOf('meta_a');
    expect(lead.call?.atMs).toBe(SLOT);
    expect(lead.call?.whatsapp).toBe('254722000111');
    expect(lead.status).toBe('site_visit');
    expect(lead.nurture?.stoppedReason).toBe('booked');
    expect(sent.map((email) => email.to).sort()).toEqual(['meta_a@example.com', 'support@snackquests.shop']);

    sent.length = 0;
    await leadNurtureService.runDue(NOW + 3 * DAY);
    expect(sent.every((email) => !email.subject.startsWith(NURTURE_SEQUENCE[1].subject))).toBe(true);
  });

  it('refuses a slot another lead holds', async () => {
    await seedLead('meta_a');
    await seedLead('meta_b');
    await leadNurtureService.bookCall('meta_a', { atMs: SLOT, whatsapp: '' }, NOW);
    await expect(leadNurtureService.bookCall('meta_b', { atMs: SLOT, whatsapp: '' }, NOW)).rejects.toBeInstanceOf(CallSlotTakenError);
  });

  it('frees the old slot when a lead moves their call', async () => {
    await seedLead('meta_a');
    await seedLead('meta_b');
    await leadNurtureService.bookCall('meta_a', { atMs: SLOT, whatsapp: '' }, NOW);
    await leadNurtureService.bookCall('meta_a', { atMs: SLOT + 30 * 60 * 1000, whatsapp: '' }, NOW);
    await expect(leadNurtureService.bookCall('meta_b', { atMs: SLOT, whatsapp: '' }, NOW)).resolves.toBe(SLOT);
  });

  it('rejects a time that is not offered', async () => {
    await seedLead('meta_a');
    await expect(leadNurtureService.bookCall('meta_a', { atMs: SLOT + 60_000, whatsapp: '' }, NOW)).rejects.toThrow(/pick one of the times/);
  });

  it('reminds the lead once, within a day of the call', async () => {
    await seedLead('meta_a');
    await leadNurtureService.bookCall('meta_a', { atMs: SLOT, whatsapp: '' }, NOW);
    sent.length = 0;
    await leadNurtureService.runDue(SLOT - 2 * DAY);
    expect(sent).toHaveLength(0);
    await leadNurtureService.runDue(SLOT - 60 * 60 * 1000);
    await leadNurtureService.runDue(SLOT - 30 * 60 * 1000);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toMatch(/^Reminder/);
  });
});
