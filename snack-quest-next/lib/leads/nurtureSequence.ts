/**
 * The automated emails a new vending lead receives (§ lead nurture).
 *
 * Every claim here is one the public /own page already makes — no
 * prices, returns or numbers that page doesn't stand behind. Edit the
 * copy freely; `day` is days after the lead came in, and each email
 * waits at least `MIN_GAP_DAYS` after the previous one, so a lead
 * enrolled late never gets two in one day.
 *
 * `{firstName}` is replaced per lead. Every email carries the booking
 * button; the sequence stops the moment a call is booked.
 */
export interface NurtureEmail {
  day: number;
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  ctaLabel: string;
}

export const MIN_GAP_DAYS = 2;

export const NURTURE_SEQUENCE: readonly NurtureEmail[] = [
  {
    day: 0,
    subject: 'Thanks for your interest in Snack Quest machines',
    preheader: 'Pick a time for a short WhatsApp call.',
    heading: 'Hi {firstName}, thanks for reaching out',
    body:
      'You asked about owning or hosting a Snack Quest Discovery Machine. The quickest way to see whether it fits is a short WhatsApp call with our team.\n\n' +
      'We’ll ask what you have access to — capital, a location, or both — and walk you through the real options for your starting point.\n\n' +
      'Pick a time that suits you below. It takes about 30 minutes.',
    ctaLabel: 'Book a WhatsApp call',
  },
  {
    day: 2,
    subject: 'What owning a Snack Quest machine actually looks like',
    preheader: 'You own the asset. We run it day to day.',
    heading: 'You own it. We run it.',
    body:
      'Owners don’t need experience running a business. Snack Quest operates the machine day to day — you own the asset and the location relationship.\n\n' +
      'You get a physical machine and a complete system around it, and you can see every machine you own from your own owner portal.\n\n' +
      'If you’d like to talk it through, book a call and we’ll answer your questions directly.',
    ctaLabel: 'Book a WhatsApp call',
  },
  {
    day: 5,
    subject: 'Why location matters more than anything',
    preheader: 'A great location gives the machine the people who buy.',
    heading: 'The location makes the machine',
    body:
      'A great machine in a weak location can struggle. A great location gives it access to the people who actually buy from it.\n\n' +
      'That’s why we look for owners who can bring more than capital. And if you don’t have a location yet, that’s fine — tell us what access you have, including relationships that could open doors, and we’ll help you think it through.',
    ctaLabel: 'Talk it through on WhatsApp',
  },
  {
    day: 9,
    subject: 'One machine can become a portfolio',
    preheader: 'The first machine is the test. The second is the repeat.',
    heading: 'Start with one. Grow from there.',
    body:
      'Many owners start with one machine and expand once it’s performing. Each additional machine plugs into the same Snack Quest operating layer, so the second is a repeat of the first.\n\n' +
      'How fast you grow depends on capital, location access and how your machines perform. A call is the easiest way to map that out for you.',
    ctaLabel: 'Book a WhatsApp call',
  },
  {
    day: 14,
    subject: 'Should we keep a spot for you?',
    preheader: 'One last note from Snack Quest.',
    heading: 'Still thinking about it, {firstName}?',
    body:
      'We haven’t spoken yet, so this is our last email about it. If owning or hosting a machine is still on your mind, book a time below and we’ll take it from there.\n\n' +
      'If now isn’t the right time, no problem — you can always reach us on WhatsApp later.',
    ctaLabel: 'Book a WhatsApp call',
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The email to send now, or null. `enrolledAtMs` is when the lead came
 * in (or was first enrolled, for leads older than the sequence).
 */
export function dueNurtureEmail(
  state: { sent: number; lastSentAtMs: number | null },
  enrolledAtMs: number,
  nowMs: number,
): NurtureEmail | null {
  const next = NURTURE_SEQUENCE[state.sent];
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
