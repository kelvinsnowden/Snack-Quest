// Seeds the platform-wide `notificationTemplates` catalog
// (types/notification.ts, repositories/notificationTemplateRepository.ts) —
// one entry per real event this codebase already publishes via
// publishEvent() (see services/withdrawalService.ts, referralService.ts,
// creatorAuthService.ts, creatorAdminService.ts, refundService.ts) that has
// a real, identifiable recipient. Idempotent — `upsert` re-runs safely as
// the catalog grows. Plain ESM, no build step: `npm run seed:notification-templates`.
import { initializeApp, cert } from 'firebase-admin/app';
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
  return initializeApp({
    credential: cert({
      projectId,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    }),
  });
}

// Lightweight branded shell for every creator-program email (§ Creator
// lifecycle emails). Deliberately table-based with inline styles only —
// no external images, web fonts, or tracking pixels — so the rendered
// HTML stays a few KB and a low text-to-markup ratio never gives a spam
// filter a "too heavy"/image-only signal to score against. The one
// brand color matches `--color-creator-brand` in app/globals.css.
function brandedEmailHtml({ heading, bodyHtml, ctaLabel, ctaHref }) {
  const cta = ctaLabel && ctaHref
    ? `<tr><td style="padding:4px 32px 4px;"><a href="${ctaHref}" style="display:inline-block;background:#ff7a00;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;font-family:Arial,Helvetica,sans-serif;">${ctaLabel}</a></td></tr>`
    : '';
  return (
    '<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ec;font-family:Arial,Helvetica,sans-serif;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:24px 0;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">' +
    '<tr><td style="background:#ff7a00;padding:20px 32px;"><span style="color:#ffffff;font-size:18px;font-weight:700;">Snack Quest</span></td></tr>' +
    `<tr><td style="padding:28px 32px 8px;"><h1 style="margin:0 0 12px;font-size:20px;color:#1f1105;">${heading}</h1>` +
    `<div style="font-size:15px;line-height:1.6;color:#3a3a3a;">${bodyHtml}</div></td></tr>` +
    cta +
    '<tr><td style="padding:20px 32px 28px;"><p style="margin:0;font-size:12px;color:#8a8a8a;">Snack Quest Creator Program &middot; This is an automated message.</p></td></tr>' +
    '</table></td></tr></table></body></html>'
  );
}

const TEMPLATES = [
  {
    templateCode: 'creator_registered_welcome_email',
    channel: 'email',
    subject: 'Welcome to the Snack Quest Creator Program, {{displayName}}!',
    bodyTemplate:
      "Hi {{displayName}},\n\nYour Snack Quest Creator account is set up. Your referral code is {{referralCode}} — share your link from the Creator Portal to start earning commission.\n\nWe'll review your application and let you know once you're approved to start earning.\n\n- Snack Quest",
    htmlBodyTemplate: brandedEmailHtml({
      heading: 'Welcome, {{displayName}}!',
      bodyHtml:
        '<p>Your Snack Quest Creator account is set up. Your referral code is <strong>{{referralCode}}</strong> — share your link from the Creator Portal to start earning commission.</p>' +
        "<p>We'll review your application and let you know once you're approved to start earning.</p>",
      ctaLabel: 'Open Creator Portal',
      ctaHref: '{{portalUrl}}',
    }),
    requiredParams: ['displayName', 'referralCode', 'portalUrl'],
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'creator_status_approved_email',
    channel: 'email',
    subject: "You're approved — welcome to Snack Quest Creators, {{displayName}}",
    bodyTemplate:
      'Hi {{displayName}},\n\nGreat news — your Snack Quest Creator account is approved and active. Your referral code is {{referralCode}}. Log in to the Creator Portal to share your link and start earning commission.\n\n- Snack Quest',
    htmlBodyTemplate: brandedEmailHtml({
      heading: "You're approved!",
      bodyHtml:
        '<p>Hi {{displayName}}, your Snack Quest Creator account is now <strong>active</strong>. Your referral code is <strong>{{referralCode}}</strong> — share your link to start earning commission on every order it brings in.</p>',
      ctaLabel: 'Open Creator Portal',
      ctaHref: '{{portalUrl}}',
    }),
    requiredParams: ['displayName', 'referralCode', 'portalUrl'],
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'referral_commission_earned_email',
    channel: 'email',
    subject: 'You earned KES {{commissionKes}} — Snack Quest',
    bodyTemplate:
      "Hi {{displayName}},\n\nYou just earned KES {{commissionKes}} commission on a referred order. It's been added to your Creator Portal balance.\n\n- Snack Quest",
    htmlBodyTemplate: brandedEmailHtml({
      heading: 'You earned KES {{commissionKes}}',
      bodyHtml:
        '<p>Hi {{displayName}}, nice work — someone just used your referral code and you earned <strong>KES {{commissionKes}}</strong> commission. It\'s already reflected in your Creator Portal balance.</p>',
      ctaLabel: 'View earnings',
      ctaHref: '{{portalUrl}}',
    }),
    requiredParams: ['displayName', 'commissionKes', 'portalUrl'],
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'withdrawal_approved_email',
    channel: 'email',
    subject: 'Your KES {{amountKes}} withdrawal is on its way',
    bodyTemplate:
      "Hi {{displayName}},\n\nYour withdrawal of KES {{amountKes}} has been approved and is being processed via M-Pesa. You'll get an M-Pesa confirmation once it's paid.\n\n- Snack Quest",
    htmlBodyTemplate: brandedEmailHtml({
      heading: 'Withdrawal approved',
      bodyHtml:
        "<p>Hi {{displayName}}, your withdrawal of <strong>KES {{amountKes}}</strong> has been approved and is being processed via M-Pesa. You'll get an M-Pesa confirmation once it's paid out.</p>",
      ctaLabel: 'View withdrawal history',
      ctaHref: '{{portalUrl}}',
    }),
    requiredParams: ['displayName', 'amountKes', 'portalUrl'],
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'creator_status_approved_sms',
    channel: 'sms',
    subject: null,
    bodyTemplate:
      "Snack Quest: You're approved! Your creator account is now active — log in to the Creator Portal to share your referral link and start earning.",
    requiredParams: [],
    htmlBodyTemplate: null,
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'creator_status_rejected_sms',
    channel: 'sms',
    subject: null,
    bodyTemplate: 'Snack Quest: Your creator application was not approved this time. Reply to this number with questions.',
    requiredParams: [],
    htmlBodyTemplate: null,
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'referral_commission_earned_sms',
    channel: 'sms',
    subject: null,
    bodyTemplate: 'Snack Quest: You earned KES {{commissionKes}} commission on a referred order. Check your balance in the Creator Portal.',
    requiredParams: ['commissionKes'],
    htmlBodyTemplate: null,
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'withdrawal_approved_sms',
    channel: 'sms',
    subject: null,
    bodyTemplate: 'Snack Quest: Your withdrawal of KES {{amountKes}} has been approved and is being processed.',
    requiredParams: ['amountKes'],
    htmlBodyTemplate: null,
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'withdrawal_paid_sms',
    channel: 'sms',
    subject: null,
    bodyTemplate: 'Snack Quest: Your withdrawal of KES {{amountKes}} has been paid via M-Pesa. Thank you for being a Snack Quest Creator!',
    requiredParams: ['amountKes'],
    htmlBodyTemplate: null,
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'withdrawal_rejected_sms',
    channel: 'sms',
    subject: null,
    bodyTemplate: 'Snack Quest: Your withdrawal request of KES {{amountKes}} was rejected. Reason: {{reason}}',
    requiredParams: ['amountKes', 'reason'],
    htmlBodyTemplate: null,
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'withdrawal_failed_sms',
    channel: 'sms',
    subject: null,
    bodyTemplate: 'Snack Quest: Your withdrawal of KES {{amountKes}} could not be completed. Your balance has been restored. We will follow up shortly.',
    requiredParams: ['amountKes'],
    htmlBodyTemplate: null,
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'refund_succeeded_sms',
    channel: 'sms',
    subject: null,
    bodyTemplate: 'Snack Quest: Your refund of KES {{amountKes}} for order {{orderId}} has been processed back to your M-Pesa number.',
    requiredParams: ['amountKes', 'orderId'],
    htmlBodyTemplate: null,
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'staff_invited_email',
    channel: 'email',
    subject: "You've been added as staff on Snack Quest Admin",
    bodyTemplate:
      "Hi {{displayName}},\n\nA super admin has created a staff account for you on Snack Quest Admin, with the role of {{role}}.\n\nSet your password to sign in: {{resetLink}}\n\nThis link is single-use and will expire — if it does, ask a super admin to send you a new one from Admin > Staff.\n\n- Snack Quest",
    requiredParams: ['displayName', 'role', 'resetLink'],
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
