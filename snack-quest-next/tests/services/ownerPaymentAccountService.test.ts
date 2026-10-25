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
const MACHINE_A = 'machine-till-a';
const MACHINE_B = 'machine-till-b';

const details = (extra: Record<string, unknown> = {}) => ({
  accountType: 'till' as const,
  shortcode: '5123456',
  headOfficeShortcode: null,
  consumerKey: 'live-consumer-key-abcd',
  consumerSecret: 'live-consumer-secret',
  passkey: 'a'.repeat(64),
  ...extra,
});

const connect = (extra: Record<string, unknown> = {}, accountId: string | null = null, nowMs = 1000) =>
  ownerPaymentAccountService.connect(BUSINESS_ID, PARTNER_ID, accountId, details(extra), nowMs);

async function seedAgreement(machineId: string, ownerBilling: 'invoice' | 'settlement') {
  await adminFirestore.collection('partnerMachineAgreements').doc(`agreement-${machineId}`).set({
    businessId: BUSINESS_ID,
    partnerId: PARTNER_ID,
    machineId,
    status: 'active',
    revenueSharePartnerPct: null,
    terms: { inventoryOwner: 'machine_owner', ownerBilling },
  });
}

beforeEach(async () => {
  checks.length = 0;
  texts.length = 0;
  vi.mocked(checkOwnerDarajaAccount).mockClear();
  for (const collection of ['partnerPaymentAccounts', 'partnerMachineAgreements', 'partners', 'machines']) await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  await adminFirestore.collection('partners').doc(PARTNER_ID).set({ businessId: BUSINESS_ID, name: 'Amina', contactPhone: '0712 345 678', status: 'active' });
  for (const [id, code] of [[MACHINE_A, 'SQ-A'], [MACHINE_B, 'SQ-B']]) {
    await adminFirestore.collection('machines').doc(id).set({ businessId: BUSINESS_ID, machineCode: code, ownerPartnerId: PARTNER_ID });
  }
});

describe('ownerPaymentAccountService.connect', () => {
  it('connects once Safaricom accepts the details, never shows the keys back, and the first till takes every machine', async () => {
    const { view, problem } = await connect();
    expect(problem).toBeNull();
    expect(view).toMatchObject({ accountType: 'till', shortcode: '5123456', headOfficeShortcode: null, status: 'connected', lastError: null, lastErrorDetail: null, lastCheckedAtMs: 1000, connectedAtMs: 1000, consumerKeyEnding: 'abcd' });
    expect([...view.machineIds].sort()).toEqual([MACHINE_A, MACHINE_B]);
    expect(JSON.stringify(view)).not.toContain('live-consumer-secret');
  });

  it('a second till takes no machines until the owner chooses, and can share the first till’s keys', async () => {
    const first = (await connect({ headOfficeShortcode: '7000001' })).view;
    const second = (await connect({ shortcode: '5123457', consumerKey: '', consumerSecret: '', passkey: '', sameKeysAs: first.id })).view;
    expect(second.machineIds).toEqual([]);
    expect(checks[1]).toMatchObject({ shortcode: '5123457', headOfficeShortcode: '7000001', consumerKey: 'live-consumer-key-abcd', passkey: 'a'.repeat(64) });
    expect(await ownerPaymentAccountService.list(BUSINESS_ID, PARTNER_ID)).toHaveLength(2);
  });

  it('saves a refused till as not working, with Safaricom’s reason and advice', async () => {
    vi.mocked(checkOwnerDarajaAccount).mockResolvedValueOnce([{ severity: 'blocker', title: 'M-Pesa rejects this shortcode and passkey together', detail: 'Re-copy the passkey.' }]);
    const { view, problem } = await connect();
    expect(problem?.title).toBe('M-Pesa rejects this shortcode and passkey together');
    expect(view).toMatchObject({ status: 'failed', lastError: 'M-Pesa rejects this shortcode and passkey together', lastErrorDetail: 'Re-copy the passkey.', connectedAtMs: null });
  });

  it('keeps the saved keys when a field is left blank, so fixing the number needs no re-pasting', async () => {
    const { view } = await connect();
    await connect({ shortcode: '5 123 457', consumerKey: '', consumerSecret: '', passkey: '' }, view.id, 2000);
    expect(checks[1]).toMatchObject({ shortcode: '5123457', consumerKey: 'live-consumer-key-abcd', consumerSecret: 'live-consumer-secret', passkey: 'a'.repeat(64) });
    const [saved] = await ownerPaymentAccountService.list(BUSINESS_ID, PARTNER_ID);
    // Still connected since the first check, and still used by the same machines.
    expect(saved.connectedAtMs).toBe(1000);
    expect(saved.machineIds).toHaveLength(2);
  });

  it('asks for what’s missing, or already connected, before checking anything with Safaricom', async () => {
    await expect(connect({ shortcode: '12' })).rejects.toBeInstanceOf(PaymentAccountValidationError);
    await expect(connect({ passkey: ' ' })).rejects.toThrow('Paste your passkey.');
    await expect(connect({ headOfficeShortcode: 'abc' })).rejects.toThrow('store number');
    await expect(connect({ sameKeysAs: 'not-mine' })).rejects.toThrow('share keys');
    expect(checks).toHaveLength(0);
    await connect();
    await expect(connect()).rejects.toThrow('already connected');
  });

  it('never touches another owner’s till', async () => {
    const { view } = await connect();
    await expect(ownerPaymentAccountService.connect(BUSINESS_ID, 'someone-else', view.id, details())).rejects.toThrow('isn’t one of yours');
    expect(await ownerPaymentAccountService.disconnect(BUSINESS_ID, 'someone-else', view.id)).toBe(false);
  });
});

describe('ownerPaymentAccountService routing', () => {
  it('pays each machine into the till chosen for it, only when connected and on invoice billing', async () => {
    const first = (await connect()).view;
    const second = (await connect({ shortcode: '6123456' })).view;
    await seedAgreement(MACHINE_A, 'invoice');
    await seedAgreement(MACHINE_B, 'settlement');
    const machine = { ownerPartnerId: PARTNER_ID };

    expect(await ownerPaymentAccountService.collectingAccountFor(BUSINESS_ID, MACHINE_A, machine)).toEqual({ partnerId: PARTNER_ID, accountId: first.id });
    expect((await ownerPaymentAccountService.routeFor(BUSINESS_ID, MACHINE_B, PARTNER_ID)).route).toBe('not_invoice_billing');

    await ownerPaymentAccountService.assignMachine(BUSINESS_ID, PARTNER_ID, MACHINE_A, second.id);
    expect(await ownerPaymentAccountService.collectingAccountFor(BUSINESS_ID, MACHINE_A, machine)).toEqual({ partnerId: PARTNER_ID, accountId: second.id });
    const tills = await ownerPaymentAccountService.list(BUSINESS_ID, PARTNER_ID);
    expect(tills.find((till) => till.id === first.id)?.machineIds).toEqual([MACHINE_B]);

    await ownerPaymentAccountService.assignMachine(BUSINESS_ID, PARTNER_ID, MACHINE_A, null);
    expect((await ownerPaymentAccountService.routeFor(BUSINESS_ID, MACHINE_A, PARTNER_ID)).route).toBe('no_till');
    expect(await ownerPaymentAccountService.collectingAccountFor(BUSINESS_ID, MACHINE_A, { ownerPartnerId: null })).toBeNull();
  });

  it('only the owner’s own machines and tills can be paired', async () => {
    const { view } = await connect();
    await adminFirestore.collection('machines').doc('their-machine').set({ businessId: BUSINESS_ID, machineCode: 'SQ-X', ownerPartnerId: 'someone-else' });
    await expect(ownerPaymentAccountService.assignMachine(BUSINESS_ID, PARTNER_ID, 'their-machine', view.id)).rejects.toThrow('machine isn’t one of yours');
    await expect(ownerPaymentAccountService.assignMachine(BUSINESS_ID, PARTNER_ID, MACHINE_A, 'not-a-till')).rejects.toThrow('till isn’t one of yours');
  });

  it('a till that stops working is switched off, and the owner is texted once', async () => {
    const { view } = await connect();
    await seedAgreement(MACHINE_A, 'invoice');
    await ownerPaymentAccountService.markUnavailable(BUSINESS_ID, view.id, 5000);
    await ownerPaymentAccountService.markUnavailable(BUSINESS_ID, view.id, 6000);
    expect((await ownerPaymentAccountService.routeFor(BUSINESS_ID, MACHINE_A, PARTNER_ID)).route).toBe('till_not_working');
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatchObject({ to: '254712345678' });
    expect(texts[0].body).toContain('till 5123456');
  });

  it('disconnecting deletes the keys, and its machines go back to Snack Quest', async () => {
    const { view } = await connect();
    expect(await ownerPaymentAccountService.disconnect(BUSINESS_ID, PARTNER_ID, view.id)).toBe(true);
    expect((await adminFirestore.collection('partnerPaymentAccounts').doc(view.id).get()).exists).toBe(false);
    expect((await ownerPaymentAccountService.routeFor(BUSINESS_ID, MACHINE_A, PARTNER_ID)).route).toBe('no_till');
  });
});
