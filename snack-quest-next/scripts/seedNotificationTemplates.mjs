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

const TEMPLATES = [
  {
    templateCode: 'creator_registered_welcome_email',
    channel: 'email',
    subject: 'Welcome to the Snack Quest Creator Program, {{displayName}}!',
    bodyTemplate:
      "Hi {{displayName}},\n\nYour Snack Quest Creator account is set up. Your referral code is {{referralCode}} — share your link from the Creator Portal to start earning commission.\n\nWe'll review your application and let you know once you're approved to start earning.\n\n- Snack Quest",
    requiredParams: ['displayName', 'referralCode'],
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
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'creator_status_rejected_sms',
    channel: 'sms',
    subject: null,
    bodyTemplate: 'Snack Quest: Your creator application was not approved this time. Reply to this number with questions.',
    requiredParams: [],
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'referral_commission_earned_sms',
    channel: 'sms',
    subject: null,
    bodyTemplate: 'Snack Quest: You earned KES {{commissionKes}} commission on a referred order. Check your balance in the Creator Portal.',
    requiredParams: ['commissionKes'],
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'withdrawal_approved_sms',
    channel: 'sms',
    subject: null,
    bodyTemplate: 'Snack Quest: Your withdrawal of KES {{amountKes}} has been approved and is being processed.',
    requiredParams: ['amountKes'],
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'withdrawal_paid_sms',
    channel: 'sms',
    subject: null,
    bodyTemplate: 'Snack Quest: Your withdrawal of KES {{amountKes}} has been paid via M-Pesa. Thank you for being a Snack Quest Creator!',
    requiredParams: ['amountKes'],
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'withdrawal_rejected_sms',
    channel: 'sms',
    subject: null,
    bodyTemplate: 'Snack Quest: Your withdrawal request of KES {{amountKes}} was rejected. Reason: {{reason}}',
    requiredParams: ['amountKes', 'reason'],
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'withdrawal_failed_sms',
    channel: 'sms',
    subject: null,
    bodyTemplate: 'Snack Quest: Your withdrawal of KES {{amountKes}} could not be completed. Your balance has been restored. We will follow up shortly.',
    requiredParams: ['amountKes'],
    version: 1,
    isActive: true,
  },
  {
    templateCode: 'refund_succeeded_sms',
    channel: 'sms',
    subject: null,
    bodyTemplate: 'Snack Quest: Your refund of KES {{amountKes}} for order {{orderId}} has been processed back to your M-Pesa number.',
    requiredParams: ['amountKes', 'orderId'],
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
