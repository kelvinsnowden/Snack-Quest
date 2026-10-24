import 'server-only';

import { createHash } from 'node:crypto';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { smtpEmailGateway } from '@/lib/integrations/email/smtpEmailGateway';
import { brandedEmailHtml, paragraphsToHtml } from '@/lib/notifications/brandedEmailHtml';
import { SUPPORT_EMAIL_ADDRESS } from '@/lib/config/supportEmail';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import { normalizeEmail } from '@/lib/checkout/email';
import { InvalidPhoneNumberError, normalizeKenyanPhone } from '@/lib/checkout/phone';
import { formatCallTime } from '@/lib/leads/callSlots';
import { availableMeetingSlots, isOfferedMeetingSlot, type MeetingDay } from '@/lib/leads/meetingSlots';
import { defaultRateLimiter } from '@/lib/rateLimit/rateLimiter';
import { vendingLeadRepository } from '@/repositories/vendingLeadRepository';
import { vendingOrderMeetingRepository } from '@/repositories/vendingOrderMeetingRepository';
import { ORDER_MEETING_MODES, type OrderMeetingMode, type VendingOrderMeeting } from '@/types/vendingOrderMeeting';
import type { VendingLeadStatus } from '@/types/vendingLead';

export { MeetingSlotTakenError } from '@/repositories/vendingOrderMeetingRepository';

export class OrderMeetingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderMeetingValidationError';
  }
}

export class OrderMeetingRateLimitError extends Error {
  constructor() {
    super('Too many bookings from this connection. Please try again in an hour, or message us on WhatsApp.');
    this.name = 'OrderMeetingRateLimitError';
  }
}

export interface OrderMeetingSubmission {
  fullName: unknown;
  whatsapp: unknown;
  email: unknown;
  location: unknown;
  mode: unknown;
  atMs: unknown;
  /** The raw client address, hashed here and never stored. */
  submitterIp?: unknown;
}

/** Bookings per connection per hour: enough for a family sharing a router, too few to fill the calendar. */
const RATE_LIMIT = { name: 'order-meeting', limit: 5, windowSeconds: 60 * 60 };
/** A lead this early in the pipeline moves to the meeting stage when they book. */
const EARLY_STATUSES: ReadonlySet<VendingLeadStatus> = new Set(['new', 'contacted', 'qualified']);
const MAX_NAME = 120;
const MAX_LOCATION = 200;

function text(value: unknown, field: string, max: number): string {
  const trimmed = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!trimmed) throw new OrderMeetingValidationError(`${field} is required.`);
  if (trimmed.length > max) throw new OrderMeetingValidationError(`${field} is too long (${max} characters at most).`);
  return trimmed;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || 'there';
}

function modeLabel(mode: OrderMeetingMode): string {
  return ORDER_MEETING_MODES.find((entry) => entry.value === mode)?.label ?? mode;
}

/**
 * The meetings where prospective owners talk through and place a
 * machine order (§ order meetings), booked from the public `/meet`
 * page linked in the founding-orders email.
 */
class OrderMeetingService {
  /** The meeting days from today to the last date: open ones with their times, and the booked ones. */
  async bookingDays(nowMs: number = Date.now()): Promise<MeetingDay[]> {
    // From a day back, so a meeting earlier today still marks today as taken.
    return availableMeetingSlots(nowMs, await vendingOrderMeetingRepository.takenDates(nowMs - 24 * 60 * 60 * 1000));
  }

  /** Books (or, for a number that already has one, moves) the meeting, then emails the team and the person. */
  async book(input: OrderMeetingSubmission, nowMs: number = Date.now()): Promise<{ atMs: number }> {
    const fullName = text(input.fullName, 'Your name', MAX_NAME);
    let phone: string;
    try {
      phone = normalizeKenyanPhone(text(input.whatsapp, 'Your WhatsApp number', 30));
    } catch (error) {
      if (error instanceof InvalidPhoneNumberError) {
        throw new OrderMeetingValidationError('That doesn’t look like a Kenyan mobile number. Try 07XX XXX XXX.');
      }
      throw error;
    }
    const rawEmail = typeof input.email === 'string' ? input.email.trim() : '';
    const email = rawEmail ? normalizeEmail(rawEmail) : null;
    if (rawEmail && !email) throw new OrderMeetingValidationError('Enter an email address we can reply to, or leave it blank.');
    const location = text(input.location, 'Where the machine would go', MAX_LOCATION);
    const mode = ORDER_MEETING_MODES.find((entry) => entry.value === input.mode)?.value;
    if (!mode) throw new OrderMeetingValidationError('Choose how you’d like to meet.');
    if (typeof input.atMs !== 'number' || !isOfferedMeetingSlot(input.atMs, nowMs)) {
      throw new OrderMeetingValidationError('Please pick one of the times shown.');
    }
    const atMs = input.atMs;

    await this.checkRateLimit(input.submitterIp, nowMs);

    // Matching is a convenience for the CRM; a failed lookup must not stop the booking.
    const leadId = await vendingLeadRepository.findIdByContact(phone, email).catch((error) => {
      console.error('[orderMeeting] lead lookup failed', error);
      return null;
    });
    const meeting: Omit<VendingOrderMeeting, 'createdAt' | 'updatedAt'> = {
      fullName,
      phone,
      email,
      location,
      mode,
      atMs,
      bookedAtMs: nowMs,
      leadId,
    };
    const { previousAtMs } = await vendingOrderMeetingRepository.book(meeting);
    const moved = previousAtMs !== null && previousAtMs !== atMs;
    const when = formatCallTime(atMs);

    const followUps: Promise<unknown>[] = [this.notifyTeam(meeting, moved)];
    if (leadId) {
      followUps.push(this.recordOnLead(leadId, meeting, moved, nowMs));
    }
    if (email) {
      followUps.push(
        this.send(email, {
          subject: `Booked: your Snack Quest meeting, ${when}`,
          heading: `You’re booked, ${firstName(fullName)}`,
          body:
            `Your meeting with Snack Quest is on ${when} (Nairobi time): ${modeLabel(mode).toLowerCase()}. ` +
            `It takes about an hour.\n\n` +
            `We’ll message you on WhatsApp at +${phone} to confirm ${mode === 'in_person' ? 'where we’ll meet' : 'the call link'}.\n\n` +
            `If the day no longer works, book again with the same WhatsApp number and we’ll move it.`,
          ctaLabel: 'Change the day',
          ctaUrl: `${getSiteUrl()}/meet`,
        }),
      );
    }
    // The booking already stands; a failed email or CRM note must not undo or hide it.
    for (const outcome of await Promise.allSettled(followUps)) {
      if (outcome.status === 'rejected') console.error('[orderMeeting] follow-up failed', outcome.reason);
    }
    return { atMs };
  }

  /** Upcoming meetings for the admin, soonest first, including any that started in the last day. */
  async listUpcoming(nowMs: number = Date.now()): Promise<{ id: string; data: VendingOrderMeeting }[]> {
    return vendingOrderMeetingRepository.listFrom(nowMs - 24 * 60 * 60 * 1000);
  }

  private async checkRateLimit(ip: unknown, nowMs: number): Promise<void> {
    if (typeof ip !== 'string' || !ip.trim()) return;
    const salt = process.env.INVESTOR_INTEREST_SALT ?? process.env.SMS_OPTOUT_SECRET ?? 'snack-quest';
    const key = `meet:${createHash('sha256').update(`${salt}:${ip.trim()}`).digest('hex').slice(0, 32)}`;
    let allowed = true;
    try {
      allowed = (await defaultRateLimiter().check([{ key, rule: RATE_LIMIT }], nowMs)).allowed;
    } catch (error) {
      // A limiter outage must not turn away a real buyer.
      console.error('[orderMeeting] rate limit check failed', error);
    }
    if (!allowed) throw new OrderMeetingRateLimitError();
  }

  private async recordOnLead(leadId: string, meeting: Omit<VendingOrderMeeting, 'createdAt' | 'updatedAt'>, moved: boolean, nowMs: number) {
    const lead = await vendingLeadRepository.findById(leadId);
    if (!lead) return;
    await vendingLeadRepository.recordOrderMeeting(
      leadId,
      meeting.atMs,
      {
        text:
          `${moved ? 'Moved' : 'Booked'} an order meeting for ${formatCallTime(meeting.atMs)} (${modeLabel(meeting.mode).toLowerCase()}). ` +
          `Machine location: ${meeting.location}.`,
        by: 'lead',
        byName: meeting.fullName,
        atMs: nowMs,
      },
      EARLY_STATUSES.has(lead.status) ? 'site_visit' : null,
    );
  }

  private async notifyTeam(meeting: Omit<VendingOrderMeeting, 'createdAt' | 'updatedAt'>, moved: boolean) {
    const when = formatCallTime(meeting.atMs);
    await this.send(SUPPORT_EMAIL_ADDRESS, {
      subject: `${moved ? 'Order meeting moved' : 'New order meeting'}: ${meeting.fullName}, ${when}`,
      heading: moved ? 'An order meeting was moved' : 'A new order meeting was booked',
      body:
        `${meeting.fullName} booked a meeting to place a machine order.\n\n` +
        `When: ${when} (Nairobi time)\n` +
        `How: ${modeLabel(meeting.mode)}\n` +
        `WhatsApp: +${meeting.phone}\n` +
        `Email: ${meeting.email ?? 'not given'}\n` +
        `Machine location: ${meeting.location}\n` +
        `In Leads: ${meeting.leadId ? 'yes' : 'no, a new contact'}`,
      ctaLabel: 'Open Leads',
      ctaUrl: `${getSiteUrl()}/admin/vending/leads`,
    });
  }

  private async send(to: string, email: { subject: string; heading: string; body: string; ctaLabel: string; ctaUrl: string }) {
    await smtpEmailGateway.send({
      businessId: getCurrentBusinessId(),
      to,
      subject: email.subject,
      body: `${email.body}\n\n${email.ctaLabel}: ${email.ctaUrl}`,
      html: brandedEmailHtml({
        heading: email.heading,
        bodyHtml: paragraphsToHtml(email.body),
        imageUrl: null,
        ctaLabel: email.ctaLabel,
        ctaUrl: email.ctaUrl,
      }),
    });
  }
}

export const orderMeetingService = new OrderMeetingService();
