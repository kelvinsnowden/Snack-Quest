/**
 * Turn on the new-order SMS alert in production (§ admin order alert).
 *
 * Two things have to be true for the alert to fire, and neither is
 * true today:
 *
 *   1. the `admin_new_order_sms` template exists and is active, and
 *   2. the business has an `adminOrderSmsPhone` set.
 *
 * Worth stating why this is not just a settings change. The business
 * already had an `adminWhatsappPhone` field described as "gets a
 * message for every new order" — it is null, and the WhatsApp
 * integration behind it is disabled, so that alert has never once
 * fired. SMS is the channel that is actually connected.
 *
 * Idempotent: prints what it finds, writes only what is missing or
 * wrong, then reads both back and refuses to report success on a value
 * it did not verify.
 *
 * Run against production:
 *   FIREBASE_ADMIN_PROJECT_ID=snack-quest-os \
 *   GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> \
 *   SNACK_QUEST_BUSINESS_ID=snack-quest \
 *   ADMIN_ORDER_SMS_PHONE=254759209705 \
 *   node scripts/enableAdminOrderSms.mjs
 *
 * Add --dry-run to print the plan and write nothing.
 */

import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const DRY_RUN = process.argv.includes('--dry-run');
const BUSINESS_ID = process.env.SNACK_QUEST_BUSINESS_ID ?? 'snack-quest';
const PHONE = process.env.ADMIN_ORDER_SMS_PHONE ?? '254759209705';

const TEMPLATE = {
  templateCode: 'admin_new_order_sms',
  channel: 'sms',
  subject: null,
  heading: null,
  bodyTemplate:
    'Snack Quest: NEW ORDER {{orderRef}} — KES {{totalKes}}. {{summary}}. {{deliverySummary}}. {{customerName}} {{customerPhone}}.',
  ctaLabel: null,
  ctaUrl: null,
  htmlBodyTemplate: null,
  requiredParams: [
    'orderRef',
    'totalKes',
    'summary',
    'deliverySummary',
    'customerName',
    'customerPhone',
  ],
  version: 1,
  isActive: true,
};

function boot() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  initializeApp(
    keyPath
      ? { credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) }
      : { credential: applicationDefault() },
  );
  return getFirestore();
}

async function main() {
  if (!/^254\d{9}$/.test(PHONE)) {
    throw new Error(`ADMIN_ORDER_SMS_PHONE must be E.164 without "+", got "${PHONE}"`);
  }

  const db = boot();
  console.log(`business ${BUSINESS_ID}${DRY_RUN ? '   (DRY RUN, nothing will be written)' : ''}\n`);

  // 1. The template.
  const templateRef = db.collection('notificationTemplates').doc(TEMPLATE.templateCode);
  const templateSnap = await templateRef.get();
  if (!templateSnap.exists) {
    console.log(`  CREATE  template ${TEMPLATE.templateCode}`);
    if (!DRY_RUN) {
      await templateRef.set({
        ...TEMPLATE,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  } else if (templateSnap.data()?.isActive !== true) {
    console.log(`  ACTIVATE template ${TEMPLATE.templateCode} (exists but inactive)`);
    if (!DRY_RUN) {
      await templateRef.update({ isActive: true, updatedAt: FieldValue.serverTimestamp() });
    }
  } else {
    console.log(`  OK      template ${TEMPLATE.templateCode} already active`);
  }

  // 2. The number.
  const businessRef = db.collection('businesses').doc(BUSINESS_ID);
  const business = (await businessRef.get()).data();
  if (!business) {
    throw new Error(`No business document at businesses/${BUSINESS_ID}`);
  }
  const current = business.adminOrderSmsPhone ?? null;
  if (current === PHONE) {
    console.log(`  OK      adminOrderSmsPhone already ${PHONE}`);
  } else {
    console.log(`  SET     adminOrderSmsPhone ${current ?? '(none)'} -> ${PHONE}`);
    if (!DRY_RUN) {
      await businessRef.update({
        adminOrderSmsPhone: PHONE,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  // The alert also needs SMS itself to be working. Reported rather than
  // fixed: enabling an integration is not this script's business, but
  // finding out afterwards that the channel was never on would be.
  const sms = (await businessRef.collection('integrationSecrets').doc('textSms').get()).data();
  console.log(
    `\n  SMS integration: ${sms ? `configured (senderId ${sms.senderId ?? '?'})` : 'NOT CONFIGURED — the alert cannot send'}`,
  );

  if (DRY_RUN) {
    console.log('\n  dry run: nothing was written.');
    return;
  }

  // Read back rather than trust the writes.
  console.log('\n  verifying:');
  const finalTemplate = (await templateRef.get()).data();
  const finalPhone = (await businessRef.get()).data()?.adminOrderSmsPhone ?? null;
  const templateOk = finalTemplate?.isActive === true;
  const phoneOk = finalPhone === PHONE;
  console.log(`    ${templateOk ? 'PASS' : 'FAIL'}  template active`);
  console.log(`    ${phoneOk ? 'PASS' : 'FAIL'}  adminOrderSmsPhone = ${finalPhone}`);
  if (!templateOk || !phoneOk) {
    throw new Error('admin order SMS is not fully enabled');
  }
  console.log('\n  new orders will now text ' + PHONE + '.');
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
