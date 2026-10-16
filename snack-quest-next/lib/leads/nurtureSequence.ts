/**
 * The automated emails a new vending lead receives (§ lead nurture).
 *
 * Staff edit the sequence in Admin → Vending → Leads → Emails; it is
 * stored in `leadNurtureSettings/{businessId}`. `DEFAULT_NURTURE_SEQUENCE`
 * below is what runs until someone saves their own, and is where the
 * editor starts. Its claims are only ones the public /own page already
 * makes — no prices, returns or numbers that page doesn't stand behind.
 *
 * `day` is days after the lead came in, and each email waits at least
 * `MIN_GAP_DAYS` after the previous one, so a lead enrolled late never
 * gets two in one day. `{firstName}` is replaced per lead. Every email
 * carries the booking button; the sequence stops when a call is booked.
 */
export interface NurtureEmail {
  day: number;
  subject: string;
  heading: string;
  body: string;
  ctaLabel: string;
  /** Full-width picture at the top of the email, or null. */
  imageUrl: string | null;
}

export const MIN_GAP_DAYS = 2;

export const DEFAULT_NURTURE_SEQUENCE: readonly NurtureEmail[] = [
  {
    day: 0,
    subject: 'Thanks for your interest in Snack Quest machines',
    heading: 'Hi {firstName}, thanks for reaching out',
    body:
      'You asked about owning or hosting a Snack Quest Discovery Machine. The quickest way to see whether it fits is a short WhatsApp call with our team.\n\n' +
      'We’ll ask what you have access to — capital, a location, or both — and walk you through the real options for your starting point.\n\n' +
      'Pick a time that suits you below. It takes about 30 minutes.',
    ctaLabel: 'Book a WhatsApp call',
    imageUrl: null,
  },
  {
    day: 2,
    subject: 'What owning a Snack Quest machine actually looks like',
    heading: 'You own it. We run it.',
    body:
      'Owners don’t need experience running a business. Snack Quest operates the machine day to day — you own the asset and the location relationship.\n\n' +
      'You get a physical machine and a complete system around it, and you can see every machine you own from your own owner portal.\n\n' +
      'If you’d like to talk it through, book a call and we’ll answer your questions directly.',
    ctaLabel: 'Book a WhatsApp call',
    imageUrl: null,
  },
  {
    day: 5,
    subject: 'Why location matters more than anything',
    heading: 'The location makes the machine',
    body:
      'A great machine in a weak location can struggle. A great location gives it access to the people who actually buy from it.\n\n' +
      'That’s why we look for owners who can bring more than capital. And if you don’t have a location yet, that’s fine — tell us what access you have, including relationships that could open doors, and we’ll help you think it through.',
    ctaLabel: 'Talk it through on WhatsApp',
    imageUrl: null,
  },
  {
    day: 9,
    subject: 'One machine can become a portfolio',
    heading: 'Start with one. Grow from there.',
    body:
      'Many owners start with one machine and expand once it’s performing. Each additional machine plugs into the same Snack Quest operating layer, so the second is a repeat of the first.\n\n' +
      'How fast you grow depends on capital, location access and how your machines perform. A call is the easiest way to map that out for you.',
    ctaLabel: 'Book a WhatsApp call',
    imageUrl: null,
  },
  {
    day: 14,
    subject: 'Should we keep a spot for you?',
    heading: 'Still thinking about it, {firstName}?',
    body:
      'We haven’t spoken yet, so this is our last email about it. If owning or hosting a machine is still on your mind, book a time below and we’ll take it from there.\n\n' +
      'If now isn’t the right time, no problem — you can always reach us on WhatsApp later.',
    ctaLabel: 'Book a WhatsApp call',
    imageUrl: null,
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The email to send now, or null. `enrolledAtMs` is when the lead came
 * in (or was first enrolled, for leads older than the sequence).
 */
export function dueNurtureEmail(
  sequence: readonly NurtureEmail[],
  state: { sent: number; lastSentAtMs: number | null },
  enrolledAtMs: number,
  nowMs: number,
): NurtureEmail | null {
  const next = sequence[state.sent];
  if (!next) return null;
  if (nowMs < enrolledAtMs + next.day * DAY_MS) return null;
  // A little under whole days, so a daily job running a few minutes early still sends.
  if (state.lastSentAtMs !== null && nowMs - state.lastSentAtMs < MIN_GAP_DAYS * DAY_MS - 60 * 60 * 1000) return null;
  return next;
}

export function personalise(text: string, fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] || 'there';
  return text.replace(/\{firstName\}/g, first);
}

export const NURTURE_LIMITS = {
  maxEmails: 10,
  maxDay: 90,
  subject: 150,
  heading: 150,
  body: 5000,
  ctaLabel: 40,
} as const;

/** Uploaded images live in the site's Vercel Blob store; nothing else is accepted as an email image. */
function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.public.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

/** Checks a sequence from the editor. Returns a cleaned copy, or the first problem in plain words. */
export function validateNurtureSequence(input: unknown): { ok: true; sequence: NurtureEmail[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, error: 'Keep at least one email.' };
  if (input.length > NURTURE_LIMITS.maxEmails) return { ok: false, error: `Up to ${NURTURE_LIMITS.maxEmails} emails.` };
  const sequence: NurtureEmail[] = [];
  for (const [index, raw] of input.entries()) {
    const n = index + 1;
    const item = (raw ?? {}) as Record<string, unknown>;
    const text = (key: string) => (typeof item[key] === 'string' ? (item[key] as string).trim() : '');
    const day = Number(item.day);
    if (!Number.isInteger(day) || day < 0 || day > NURTURE_LIMITS.maxDay) {
      return { ok: false, error: `Email ${n}: the day must be a whole number from 0 to ${NURTURE_LIMITS.maxDay}.` };
    }
    if (sequence.length > 0 && day < sequence[sequence.length - 1].day) {
      return { ok: false, error: `Email ${n} is set to go out before email ${n - 1}. Put the days in order.` };
    }
    const email: NurtureEmail = {
      day,
      subject: text('subject'),
      heading: text('heading'),
      body: text('body'),
      ctaLabel: text('ctaLabel'),
      imageUrl: text('imageUrl') || null,
    };
    if (!email.subject) return { ok: false, error: `Email ${n} needs a subject.` };
    if (!email.heading) return { ok: false, error: `Email ${n} needs a heading.` };
    if (!email.body) return { ok: false, error: `Email ${n} needs some text.` };
    if (!email.ctaLabel) return { ok: false, error: `Email ${n} needs button text.` };
    for (const key of ['subject', 'heading', 'body', 'ctaLabel'] as const) {
      if (email[key].length > NURTURE_LIMITS[key]) {
        return { ok: false, error: `Email ${n}: keep the ${key === 'ctaLabel' ? 'button text' : key} under ${NURTURE_LIMITS[key]} characters.` };
      }
    }
    if (email.imageUrl && !isAllowedImageUrl(email.imageUrl)) {
      return { ok: false, error: `Email ${n}: upload the picture here rather than linking to another site.` };
    }
    sequence.push(email);
  }
  return { ok: true, sequence };
}
