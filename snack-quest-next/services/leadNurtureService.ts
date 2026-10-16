import 'server-only';

import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { smtpEmailGateway } from '@/lib/integrations/email/smtpEmailGateway';
import { brandedEmailHtml, escapeHtml, paragraphsToHtml } from '@/lib/notifications/brandedEmailHtml';
import { SUPPORT_EMAIL_ADDRESS } from '@/lib/config/supportEmail';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import { bookCallUrl, stopEmailsUrl } from '@/lib/leads/leadLinks';
import { NURTURE_SEQUENCE, dueNurtureEmail, personalise } from '@/lib/leads/nurtureSequence';
import { availableCallSlots, formatCallTime, isOfferedSlot, type CallDay } from '@/lib/leads/callSlots';
import { isValidKenyanPhone, normalizeKenyanPhone } from '@/lib/checkout/phone';
import { vendingLeadRepository } from '@/repositories/vendingLeadRepository';
import type { VendingLead, VendingLeadStatus } from '@/types/vendingLead';

export { CallSlotTakenError } from '@/repositories/vendingLeadRepository';

export class LeadBookingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeadBookingError';
  }
}

/** Only leads still being worked get nurture emails; anyone further along is talking to a person already. */
const NURTURE_STATUSES: ReadonlySet<VendingLeadStatus> = new Set(['new', 'contacted']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Per run, so one run never holds a request open for long. The rest go next run. */
const MAX_EMAILS_PER_RUN = 40;

export interface NurtureRunResult {
  enabled: boolean;
  sent: number;
  failed: number;
  reminders: number;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || 'there';
}

/**
 * The automated side of the vending leads CRM (§ lead nurture): the
 * email sequence that keeps a new lead warm until they book, and the
 * WhatsApp call booking that ends it.
 *
 * Nothing is emailed unless `LEAD_NURTURE_ENABLED=true` — turning it on
 * is a deliberate act, since it writes to real people.
 */
class LeadNurtureService {
  isEnabled(): boolean {
    return process.env.LEAD_NURTURE_ENABLED === 'true';
  }

  /** Sends every nurture email and call reminder that is due. Safe to run any number of times. */
  async runDue(nowMs: number = Date.now()): Promise<NurtureRunResult> {
    const result: NurtureRunResult = { enabled: this.isEnabled(), sent: 0, failed: 0, reminders: 0 };
    if (!result.enabled) return result;

    const leads = await vendingLeadRepository.listRecent();
    for (const { id, data: lead } of leads) {
      if (result.sent + result.failed >= MAX_EMAILS_PER_RUN) break;
      if (lead.call) {
        if (await this.remindIfDue(id, lead, nowMs)) result.reminders += 1;
        continue;
      }
      if (!lead.email || !EMAIL_RE.test(lead.email) || lead.emailOptOutAtMs) continue;
      if (!NURTURE_STATUSES.has(lead.status) || lead.nurture?.stoppedReason) continue;

      const state = lead.nurture ?? { sent: 0, lastSentAtMs: null, stoppedReason: null };
      const email = dueNurtureEmail(state, lead.submittedAtMs, nowMs);
      if (!email) continue;
      const isLast = state.sent + 1 >= NURTURE_SEQUENCE.length;
      if (!(await vendingLeadRepository.claimNurtureEmail(id, state.sent, nowMs, isLast))) continue;

      try {
        const site = getSiteUrl();
        await this.send(lead.email, {
          subject: personalise(email.subject, lead.fullName),
          heading: personalise(email.heading, lead.fullName),
          body: personalise(email.body, lead.fullName),
          ctaLabel: email.ctaLabel,
          ctaUrl: bookCallUrl(site, id),
          stopUrl: stopEmailsUrl(site, id),
        });
        result.sent += 1;
      } catch (error) {
        // Put the claim back so the next run retries this email.
        console.error('[leadNurture] email failed', id, error);
        await vendingLeadRepository.setNurture(id, state);
        result.failed += 1;
      }
    }
    return result;
  }

  private async remindIfDue(id: string, lead: VendingLead, nowMs: number): Promise<boolean> {
    const call = lead.call;
    if (!call || call.reminderSentAtMs || call.atMs <= nowMs || call.atMs - nowMs > DAY_MS) return false;
    if (!lead.email || !EMAIL_RE.test(lead.email)) return false;
    try {
      await this.send(lead.email, {
        subject: `Reminder: your Snack Quest call, ${formatCallTime(call.atMs)}`,
        heading: `See you soon, ${firstName(lead.fullName)}`,
        body:
          `This is a reminder of your WhatsApp call with Snack Quest on ${formatCallTime(call.atMs)} (Nairobi time).\n\n` +
          `We’ll call you on WhatsApp at +${call.whatsapp}. If the time no longer works, you can pick another below.`,
        ctaLabel: 'Change the time',
        ctaUrl: bookCallUrl(getSiteUrl(), id),
        stopUrl: null,
      });
      await vendingLeadRepository.markCallReminderSent(id, nowMs);
      return true;
    } catch (error) {
      console.error('[leadNurture] reminder failed', id, error);
      return false;
    }
  }

  /** What the public booking page needs: who it's for, their current booking, and the open slots. */
  async bookingView(leadId: string, nowMs: number = Date.now()): Promise<{
    firstName: string;
    whatsapp: string;
    bookedAtMs: number | null;
    days: CallDay[];
  } | null> {
    const lead = await vendingLeadRepository.findById(leadId);
    if (!lead) return null;
    const taken = await vendingLeadRepository.takenCallSlots(nowMs);
    if (lead.call) taken.delete(lead.call.atMs);
    return {
      firstName: firstName(lead.fullName),
      whatsapp: lead.call?.whatsapp ?? lead.phone,
      bookedAtMs: lead.call && lead.call.atMs > nowMs ? lead.call.atMs : null,
      days: availableCallSlots(nowMs, taken),
    };
  }

  /** Books (or moves) the lead's WhatsApp call, then confirms by email to them and to the team. */
  async bookCall(leadId: string, input: { atMs: unknown; whatsapp: unknown }, nowMs: number = Date.now()): Promise<number> {
    const lead = await vendingLeadRepository.findById(leadId);
    if (!lead) throw new LeadBookingError('This booking link is no longer valid.');
    if (typeof input.atMs !== 'number' || !isOfferedSlot(input.atMs, nowMs)) {
      throw new LeadBookingError('Please pick one of the times shown.');
    }
    const typed = typeof input.whatsapp === 'string' ? input.whatsapp.trim() : '';
    if (typed && !isValidKenyanPhone(typed)) {
      throw new LeadBookingError('That doesn’t look like a Kenyan mobile number. Try 07XX XXX XXX.');
    }
    const whatsapp = typed ? normalizeKenyanPhone(typed) : lead.phone;
    if (!whatsapp) throw new LeadBookingError('Please enter a WhatsApp number we can call.');

    const rescheduled = Boolean(lead.call);
    await vendingLeadRepository.bookCall(
      leadId,
      { atMs: input.atMs, bookedAtMs: nowMs, whatsapp, reminderSentAtMs: null },
      {
        text: `${rescheduled ? 'Moved' : 'Booked'} a WhatsApp call for ${formatCallTime(input.atMs)} on +${whatsapp}.`,
        by: 'lead',
        byName: lead.fullName,
        atMs: nowMs,
      },
      NURTURE_STATUSES.has(lead.status) ? 'site_visit' : null,
    );

    const when = formatCallTime(input.atMs);
    const site = getSiteUrl();
    const sends: Promise<unknown>[] = [
      this.send(SUPPORT_EMAIL_ADDRESS, {
        subject: `${rescheduled ? 'Call moved' : 'New call booked'}: ${lead.fullName}, ${when}`,
        heading: rescheduled ? 'A lead moved their call' : 'A lead booked a call',
        body: `${lead.fullName} booked a WhatsApp call for ${when} (Nairobi time).\n\nCall them on +${whatsapp}.`,
        ctaLabel: 'Open Leads',
        ctaUrl: `${site}/admin/vending/leads`,
        stopUrl: null,
      }),
    ];
    if (lead.email && EMAIL_RE.test(lead.email)) {
      sends.push(
        this.send(lead.email, {
          subject: `Booked: your Snack Quest call, ${when}`,
          heading: `You’re booked, ${firstName(lead.fullName)}`,
          body:
            `Your WhatsApp call with Snack Quest is on ${when} (Nairobi time). It takes about 30 minutes.\n\n` +
            `We’ll call you on WhatsApp at +${whatsapp}. You’ll get a reminder on the day.`,
          ctaLabel: 'Change the time',
          ctaUrl: bookCallUrl(site, leadId),
          stopUrl: null,
        }),
      );
    }
    // The booking already stands; a failed confirmation email must not undo or hide it.
    for (const outcome of await Promise.allSettled(sends)) {
      if (outcome.status === 'rejected') console.error('[leadNurture] booking email failed', leadId, outcome.reason);
    }
    return input.atMs;
  }

  async stopEmails(leadId: string, nowMs: number = Date.now()): Promise<boolean> {
    const lead = await vendingLeadRepository.findById(leadId);
    if (!lead) return false;
    if (!lead.emailOptOutAtMs) await vendingLeadRepository.optOutOfEmails(leadId, nowMs);
    return true;
  }

  private async send(
    to: string,
    email: { subject: string; heading: string; body: string; ctaLabel: string; ctaUrl: string; stopUrl: string | null },
  ): Promise<void> {
    const stop = email.stopUrl
      ? `<p style="margin:18px 0 0;font-size:12px;color:#8a8494;">Don’t want these emails? <a href="${escapeHtml(email.stopUrl)}" style="color:#8a8494;">Stop them here</a>.</p>`
      : '';
    await smtpEmailGateway.send({
      businessId: getCurrentBusinessId(),
      to,
      subject: email.subject,
      body:
        `${email.body}\n\n${email.ctaLabel}: ${email.ctaUrl}` +
        (email.stopUrl ? `\n\nStop these emails: ${email.stopUrl}` : ''),
      html: brandedEmailHtml({
        heading: email.heading,
        bodyHtml: paragraphsToHtml(email.body) + stop,
        ctaLabel: email.ctaLabel,
        ctaUrl: email.ctaUrl,
        footerText: 'Snack Quest · Nairobi',
      }),
    });
  }
}

export const leadNurtureService = new LeadNurtureService();
