// Seeds the platform-wide `notificationTemplates` catalog
// (types/notification.ts, repositories/notificationTemplateRepository.ts) —
// one entry per real event this codebase already publishes via
// publishEvent() (see services/withdrawalService.ts, referralService.ts,
// creatorAuthService.ts, creatorAdminService.ts, refundService.ts) that has
// a real, identifiable recipient. Idempotent — `upsert` re-runs safely as
// the catalog grows. Plain ESM, no build step: `npm run seed:notification-templates`.
//
// Every email template's `heading`/`bodyTemplate`/`ctaLabel`/`ctaUrl` here
// is the STARTING content only — once a super admin edits and saves a
// template in Admin: Notification Templates, `htmlBodyTemplate` is
// re-rendered from those fields by `services/notificationTemplateService.ts`
// (the real TS `brandedEmailHtml()`), not by this script. Re-running this
// script after that point would overwrite those edits back to this
// starting content, so treat it as first-bootstrap-only for any template
// code that's already live, not a routine re-seed.
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const isEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';
if (isEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
}

function createApp() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? 'demo-project';
  if (isEmulator) {
    return initializeApp({ projectId });
  }
  // A downloaded service-account JSON (the same path used for one-off
  // `firebase deploy --only firestore:indexes` runs against production)
  // is the standard `GOOGLE_APPLICATION_CREDENTIALS` convention — takes
  // priority when set, since `.env.local`'s own admin vars are normally
  // only populated for local/emulator use.
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return initializeApp({ credential: applicationDefault(), projectId });
  }
  return initializeApp({
    credential: cert({
      projectId,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    }),
  });
}

// The real logo, absolute URL — same value as the deployed
// `public/logo.png` and `lib/notifications/brandedEmailHtml.ts`'s own
// `LOGO_URL` constant. Duplicated here (not imported) because this
// script deliberately has no build step — see this file's own doc
// comment on why it keeps a standalone copy of the shell.
const LOGO_URL = 'https://www.snackquests.shop/logo.png';

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Blank-line-separated paragraphs of plain text into escaped `<p>` tags — matches `lib/notifications/brandedEmailHtml.ts`'s `paragraphsToHtml()` exactly, so a template's first render here looks the same as a re-render from Admin: Notification Templates later. */
function paragraphsToHtml(text) {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;">${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

// Lightweight branded shell for every creator-program email (§ Creator
// lifecycle emails). Deliberately table-based with inline styles only —
// no web fonts or tracking pixels — so the rendered HTML stays a few KB
// and a low text-to-markup ratio never gives a spam filter a "too heavy"
// signal to score against. Kept in sync by hand with
// `lib/notifications/brandedEmailHtml.ts`'s real TS version (same brand
// colors, same logo, same structure) — this is the one-time seed value;
// every subsequent edit renders through the real TS shell instead.
function brandedEmailHtml({ heading, bodyHtml, ctaLabel, ctaHref }) {
  const cta = ctaLabel && ctaHref
    ? `<tr><td style="padding:12px 32px 8px;text-align:center;"><a href="${ctaHref}" style="display:inline-block;background-color:#ff7a00;background:linear-gradient(135deg,#ff7a00,#e56a00);color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 36px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;">${ctaLabel}</a></td></tr>`
    : '';
  return (
    '<!doctype html><html><body style="margin:0;padding:0;background-color:#f4f2fb;font-family:Arial,Helvetica,sans-serif;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f2fb;padding:24px 0;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;">' +
    `<tr><td style="background-color:#ff7a00;background:linear-gradient(135deg,#ff7a00 0%,#6c3bff 100%);padding:20px 32px;text-align:center;"><img src="${LOGO_URL}" width="64" height="64" alt="Snack Quest" style="display:block;margin:0 auto;width:64px;height:64px;border-radius:14px;border:0;" /></td></tr>` +
    `<tr><td style="padding:32px 32px 4px;text-align:center;"><h1 style="margin:0 0 16px;font-size:26px;line-height:1.28;color:#1f1105;font-weight:800;font-family:Arial,Helvetica,sans-serif;">${heading}</h1>` +
    `<div style="font-size:15px;line-height:1.65;color:#3a3a3a;text-align:left;">${bodyHtml}</div></td></tr>` +
    cta +
    '<tr><td style="padding:24px 32px 26px;border-top:1px solid #eee6ff;text-align:center;"><p style="margin:0;font-size:12px;color:#8a8a8a;">Snack Quest &middot; This is an automated message.</p></td></tr>' +
    '</table></td></tr></table></body></html>'
  );
}

function emailTemplate({ templateCode, subject, heading, bodyTemplate, ctaLabel, ctaUrl, requiredParams }) {
  return {
    templateCode,
    channel: 'email',
    subject,
    heading,
    bodyTemplate,
    ctaLabel,
    ctaUrl,
    htmlBodyTemplate: brandedEmailHtml({ heading, bodyHtml: paragraphsToHtml(bodyTemplate), ctaLabel, ctaHref: ctaUrl }),
    requiredParams,
    version: 1,
    isActive: true,
  };
}

const TEMPLATES = [
  emailTemplate({
    templateCode: 'creator_registered_welcome_email',
    subject: 'Welcome to the Snack Quest Creator Program, {{displayName}}!',
    heading: 'Welcome, {{displayName}}!',
    bodyTemplate:
      'Your Snack Quest Creator account is set up. Your referral code is {{referralCode}} — share your link from the Creator Portal to start earning commission.\n\nWe’ll review your application and let you know once you’re approved to start earning.',
    ctaLabel: 'Open Creator Portal',
    ctaUrl: '{{portalUrl}}',
    requiredParams: ['displayName', 'referralCode', 'portalUrl'],
  }),
  emailTemplate({
    templateCode: 'creator_status_approved_email',
    subject: 'Before Your First Post — Read This, {{displayName}}',
    heading: 'Before your first post',
    bodyTemplate:
      'Hey {{displayName}}, before you share your first Snack Quest link, I want to tell you why this program exists.\n\n' +
      'Snack Quest needs to grow, and creators already have something valuable — an audience that trusts them. A lot of small creators have that audience but never had a real way to earn from it.\n\n' +
      "Here's the honest deal: I need people to discover Snack Quest. You need a real way to earn from the audience you've already built. I built this program so both of those can be true.\n\n" +
      'You earn KES 300 for every successful sale.\n\n' +
      'Your audience gets KES 250 off when they buy through your link.\n\n' +
      "I've also built resources for people who've never made money online before — how to market, understand your audience, and even how paid ads work. Skills that stay useful beyond Snack Quest.\n\n" +
      "You don't need a shop, capital, inventory or a laptop. You can start with the phone already in your hand.\n\n" +
      "I won't promise you overnight results or guaranteed income. This still takes real learning, effort and consistency.\n\n" +
      "Your referral code is {{referralCode}} — it's already active. Open your Creator Portal below to grab your link and get started.\n\n" +
      "I don't know exactly how far Snack Quest will go. But I want to build it with people, not just for them. You're one of those people now.",
    ctaLabel: 'Start Your Quest',
    ctaUrl: '{{portalUrl}}',
    requiredParams: ['displayName', 'referralCode', 'portalUrl'],
  }),
  emailTemplate({
    templateCode: 'referral_commission_earned_email',
    subject: 'You earned KES {{commissionKes}} — Snack Quest',
    heading: 'You earned KES {{commissionKes}}',
    bodyTemplate:
      'Hi {{displayName}}, nice work — someone just used your referral code and you earned KES {{commissionKes}} commission. It’s already reflected in your Creator Portal balance.',
    ctaLabel: 'View earnings',
    ctaUrl: '{{portalUrl}}',
    requiredParams: ['displayName', 'commissionKes', 'portalUrl'],
  }),
  emailTemplate({
    templateCode: 'withdrawal_approved_email',
    subject: 'Your KES {{amountKes}} withdrawal is on its way',
    heading: 'Withdrawal approved',
    bodyTemplate:
      'Hi {{displayName}}, your withdrawal of KES {{amountKes}} has been approved and is being processed via M-Pesa. You’ll get an M-Pesa confirmation once it’s paid out.',
    ctaLabel: 'View withdrawal history',
    ctaUrl: '{{portalUrl}}',
    requiredParams: ['displayName', 'amountKes', 'portalUrl'],
  }),
  emailTemplate({
    templateCode: 'staff_invited_email',
    subject: "You've been added as staff on Snack Quest Admin",
    heading: 'Welcome to Snack Quest Admin',
    bodyTemplate:
      'Hi {{displayName}}, a super admin has created a staff account for you on Snack Quest Admin, with the role of {{role}}.\n\nThis link is single-use and will expire — if it does, ask a super admin to send you a new one from Admin > Staff.',
    ctaLabel: 'Set your password',
    ctaUrl: '{{resetLink}}',
    requiredParams: ['displayName', 'role', 'resetLink'],
  }),
  {
    templateCode: 'creator_status_approved_sms',
    channel: 'sms',
    subject: null,
    heading: null,
    bodyTemplate:
      "Snack Quest: You're approved! Your creator account is now active — log in to the Creator Portal to share your referral link and start earning.",
    ctaLabel: null,
    ctaUrl: null,
    requiredParams: [],
    htmlBodyTemplate: null,
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'creator_status_rejected_sms',
    channel: 'sms',
    subject: null,
    heading: null,
    bodyTemplate: 'Snack Quest: Your creator application was not approved this time. Reply to this number with questions.',
    ctaLabel: null,
    ctaUrl: null,
    requiredParams: [],
    htmlBodyTemplate: null,
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'referral_commission_earned_sms',
    channel: 'sms',
    subject: null,
    heading: null,
    bodyTemplate: 'Snack Quest: You earned KES {{commissionKes}} commission on a referred order. Check your balance in the Creator Portal.',
    ctaLabel: null,
    ctaUrl: null,
    requiredParams: ['commissionKes'],
    htmlBodyTemplate: null,
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'withdrawal_approved_sms',
    channel: 'sms',
    subject: null,
    heading: null,
    bodyTemplate: 'Snack Quest: Your withdrawal of KES {{amountKes}} has been approved and is being processed.',
    ctaLabel: null,
    ctaUrl: null,
    requiredParams: ['amountKes'],
    htmlBodyTemplate: null,
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'withdrawal_paid_sms',
    channel: 'sms',
    subject: null,
    heading: null,
    bodyTemplate: 'Snack Quest: Your withdrawal of KES {{amountKes}} has been paid via M-Pesa. Thank you for being a Snack Quest Creator!',
    ctaLabel: null,
    ctaUrl: null,
    requiredParams: ['amountKes'],
    htmlBodyTemplate: null,
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'withdrawal_rejected_sms',
    channel: 'sms',
    subject: null,
    heading: null,
    bodyTemplate: 'Snack Quest: Your withdrawal request of KES {{amountKes}} was rejected. Reason: {{reason}}',
    ctaLabel: null,
    ctaUrl: null,
    requiredParams: ['amountKes', 'reason'],
    htmlBodyTemplate: null,
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'withdrawal_failed_sms',
    channel: 'sms',
    subject: null,
    heading: null,
    bodyTemplate: 'Snack Quest: Your withdrawal of KES {{amountKes}} could not be completed. Your balance has been restored. We will follow up shortly.',
    ctaLabel: null,
    ctaUrl: null,
    requiredParams: ['amountKes'],
    htmlBodyTemplate: null,
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'refund_succeeded_sms',
    channel: 'sms',
    subject: null,
    heading: null,
    bodyTemplate: 'Snack Quest: Your refund of KES {{amountKes}} for order {{orderId}} has been processed back to your M-Pesa number.',
    ctaLabel: null,
    ctaUrl: null,
    requiredParams: ['amountKes', 'orderId'],
    htmlBodyTemplate: null,
    version: 1,
    isActive: true,
  },
  /*
   * The first two customer-facing templates in this catalog — every
   * other entry goes to a creator or a staff member. Both are kept to
   * one 160-character SMS segment with realistic values substituted in,
   * since TextSMS bills per segment and a two-segment order
   * confirmation costs double for no added clarity.
   *
   * Deliberately terser than their WhatsApp equivalents, which stay
   * exactly as they are: WhatsApp carries the pickup-station detail and
   * the Jumia tracking URL, and SMS is the channel that arrives even
   * when the customer never opens WhatsApp. Saying less here is the
   * point, not a limitation being worked around.
   */
  {
    templateCode: 'order_confirmed_sms',
    channel: 'sms',
    subject: null,
    heading: null,
    bodyTemplate:
      'Snack Quest: Payment received. Order {{orderRef}} is confirmed — KES {{totalKes}} ({{paymentRef}}). We will text you the moment it ships.',
    ctaLabel: null,
    ctaUrl: null,
    // `paymentRef` rather than an M-Pesa receipt: a cash or bank-transfer
    // order genuinely has no M-Pesa code, and "M-Pesa ref cash" is worse
    // than saying nothing (§ super-admin manual payment orders).
    requiredParams: ['orderRef', 'totalKes', 'paymentRef'],
    htmlBodyTemplate: null,
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'order_dispatched_sms',
    channel: 'sms',
    subject: null,
    heading: null,
    bodyTemplate: 'Snack Quest: Your order {{orderRef}} has shipped and is on its way. Enjoy the quest!',
    ctaLabel: null,
    ctaUrl: null,
    requiredParams: ['orderRef'],
    htmlBodyTemplate: null,
    version: 1,
    isActive: true,
  },
];

async function main() {
  const app = createApp();
  const db = getFirestore(app);

  for (const template of TEMPLATES) {
    await db.collection('notificationTemplates').doc(template.templateCode).set(template);
    console.log(`Wrote notificationTemplates/${template.templateCode}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
