import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';

const checks = vi.hoisted(() => [] as { consumerKey: string; consumerSecret: string; passkey: string; shortcode: string; headOfficeShortcode: string | null }[]);
const texts = vi.hoisted(() => [] as { to: string; body: string }[]);
vi.mock('@/lib/integrations/daraja/darajaGateway', () => ({
  checkOwnerDarajaAccount: vi.fn(async (_businessId: string, _partnerId: string, account: (typeof checks)[number]) => {
    checks.push(account);
    return [];
  }),
}));
vi.mock('@/lib/integrations/sms/textSmsGateway', () => ({
  textSmsGateway: {
    send: vi.fn(async (input: { to: string; body: string }) => {
      texts.push(input);
      return { providerMessageId: 'test' };
    }),
  },
}));

import { ownerPaymentAccountService, PaymentAccountValidationError } from '@/services/ownerPaymentAccountService';
import { checkOwnerDarajaAccount } from '@/lib/integrations/daraja/darajaGateway';

/** § OWNER TILL — against the Firestore emulator, with Safaricom's check and SMS faked. */

const BUSINESS_ID = 'biz-owner-till-test';
const PARTNER_ID = 'partner-till';
const MACHINE_ID = 'machine-till';

const details = (extra: Record<string, unknown> = {}) => ({
  accountType: 'till' as const,
  shortcode: '5123456',
  headOfficeShortcode: null,
  consumerKey: 'live-consumer-key-abcd',
  consumerSecret: 'live-consumer-secret',
  passkey: 'a'.repeat(64),
  ...extra,
});

async function seedAgreement(ownerBilling: 'invoice' | 'settlement') {
  await adminFirestore.collection('partnerMachineAgreements').doc('agreement-till').set({
    businessId: BUSINESS_ID,
    partnerId: PARTNER_ID,
    machineId: MACHINE_ID,
    status: 'active',
    revenueSharePartnerPct: null,
    terms: { inventoryOwner: 'machine_owner', ownerBilling },
  });
}

beforeEach(async () => {
  checks.length = 0;
  texts.length = 0;
  vi.mocked(checkOwnerDarajaAccount).mockClear();
  for (const collection of ['partnerPaymentAccounts', 'partnerMachineAgreements', 'partners']) await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  await adminFirestore.collection('partners').doc(PARTNER_ID).set({ businessId: BUSINESS_ID, name: 'Amina', contactPhone: '0712 345 678', status: 'active' });
});

describe('ownerPaymentAccountService.connect', () => {
  it('connects once Safaricom accepts the details, and never shows the keys back', async () => {
    const { view, problem } = await ownerPaymentAccountService.connect(BUSINESS_ID, PARTNER_ID, details(), 1000);
    expect(problem).toBeNull();
    expect(view).toEqual({ accountType: 'till', shortcode: '5123456', headOfficeShortcode: null, status: 'connected', lastError: null, lastErrorDetail: null, lastCheckedAtMs: 1000, connectedAtMs: 1000, consumerKeyEnding: 'abcd' });
    expect(JSON.stringify(view)).not.toContain('live-consumer-secret');
  });

  it('saves a refused account as not working, with Safaricom’s reason', async () => {
    vi.mocked(checkOwnerDarajaAccount).mockResolvedValueOnce([{ severity: 'blocker', title: 'M-Pesa rejects this shortcode and passkey together', detail: 'Re-copy the passkey.' }]);
    const { view, problem } = await ownerPaymentAccountService.connect(BUSINESS_ID, PARTNER_ID, details(), 1000);
    expect(problem?.title).toBe('M-Pesa rejects this shortcode and passkey together');
    expect(view).toMatchObject({ status: 'failed', lastError: 'M-Pesa rejects this shortcode and passkey together', lastErrorDetail: 'Re-copy the passkey.', connectedAtMs: null });
  });

  it('keeps the saved keys when a field is left blank, so fixing the number needs no re-pasting', async () => {
    await ownerPaymentAccountService.connect(BUSINESS_ID, PARTNER_ID, details(), 1000);
    await ownerPaymentAccountService.connect(BUSINESS_ID, PARTNER_ID, details({ shortcode: '5 123 457', consumerKey: '', consumerSecret: '', passkey: '' }), 2000);
    expect(checks[1]).toMatchObject({ shortcode: '5123457', consumerKey: 'live-consumer-key-abcd', consumerSecret: 'live-consumer-secret', passkey: 'a'.repeat(64) });
    // Still connected since the first check, not reset by the second.
    expect((await ownerPaymentAccountService.view(BUSINESS_ID, PARTNER_ID))?.connectedAtMs).toBe(1000);
  });

  it('asks for what’s missing before checking anything with Safaricom', async () => {
    await expect(ownerPaymentAccountService.connect(BUSINESS_ID, PARTNER_ID, details({ shortcode: '12' }))).rejects.toBeInstanceOf(PaymentAccountValidationError);
    await expect(ownerPaymentAccountService.connect(BUSINESS_ID, PARTNER_ID, details({ passkey: ' ' }))).rejects.toThrow('Paste your passkey.');
    await expect(ownerPaymentAccountService.connect(BUSINESS_ID, PARTNER_ID, details({ headOfficeShortcode: 'abc' }))).rejects.toThrow('store number');
    expect(checks).toHaveLength(0);
  });

  it('a store number equal to the till is the same as none', async () => {
    const { view } = await ownerPaymentAccountService.connect(BUSINESS_ID, PARTNER_ID, details({ headOfficeShortcode: '5123456' }));
    expect(view.headOfficeShortcode).toBeNull();
  });
});

describe('ownerPaymentAccountService routing', () => {
  it('pays a machine’s sales into the owner’s till only when connected and on invoice billing', async () => {
    const machine = { ownerPartnerId: PARTNER_ID };
    expect(await ownerPaymentAccountService.routeFor(BUSINESS_ID, MACHINE_ID, PARTNER_ID)).toBe('not_connected');
    await ownerPaymentAccountService.connect(BUSINESS_ID, PARTNER_ID, details());
    await seedAgreement('settlement');
    expect(await ownerPaymentAccountService.routeFor(BUSINESS_ID, MACHINE_ID, PARTNER_ID)).toBe('not_invoice_billing');
    expect(await ownerPaymentAccountService.collectingAccountFor(BUSINESS_ID, MACHINE_ID, machine)).toBeNull();
    await seedAgreement('invoice');
    expect(await ownerPaymentAccountService.collectingAccountFor(BUSINESS_ID, MACHINE_ID, machine)).toEqual({ partnerId: PARTNER_ID });
    expect(await ownerPaymentAccountService.collectingAccountFor(BUSINESS_ID, MACHINE_ID, { ownerPartnerId: null })).toBeNull();
  });

  it('a till that stops working is switched off, and the owner is texted once', async () => {
    await ownerPaymentAccountService.connect(BUSINESS_ID, PARTNER_ID, details());
    await seedAgreement('invoice');
    await ownerPaymentAccountService.markUnavailable(BUSINESS_ID, PARTNER_ID, 5000);
    await ownerPaymentAccountService.markUnavailable(BUSINESS_ID, PARTNER_ID, 6000);
    expect(await ownerPaymentAccountService.routeFor(BUSINESS_ID, MACHINE_ID, PARTNER_ID)).toBe('not_connected');
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatchObject({ to: '254712345678' });
    expect(texts[0].body).toContain('till 5123456');
  });

  it('disconnecting deletes the keys', async () => {
    await ownerPaymentAccountService.connect(BUSINESS_ID, PARTNER_ID, details());
    expect(await ownerPaymentAccountService.disconnect(BUSINESS_ID, PARTNER_ID)).toBe(true);
    expect((await adminFirestore.collection('partnerPaymentAccounts').doc(PARTNER_ID).get()).exists).toBe(false);
    expect(await ownerPaymentAccountService.disconnect('another-business', PARTNER_ID)).toBe(false);
  });
});
