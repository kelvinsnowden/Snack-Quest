import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { customerWalletRepository, InsufficientWalletBalanceError, walletId } from '@/repositories/customerWalletRepository';

const BUSINESS_ID = 'biz-customer-wallet-repo-test';
const OTHER_BUSINESS_ID = 'biz-customer-wallet-repo-other';
const PHONE = '254700000001';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('customerWallets'));
});

describe('CustomerWalletRepository.applyInTransaction', () => {
  it('creates a wallet on first credit and writes a matching ledger entry', async () => {
    const balanceAfterKes = await adminFirestore.runTransaction((tx) =>
      customerWalletRepository.applyInTransaction(tx, BUSINESS_ID, PHONE, {
        type: 'milestone_bonus',
        amountKes: 100,
        note: 'Welcome bonus',
        orderId: 'order-1',
        createdBy: 'system',
      }),
    );
    expect(balanceAfterKes).toBe(100);

    const wallet = await customerWalletRepository.get(BUSINESS_ID, PHONE);
    expect(wallet).toMatchObject({ businessId: BUSINESS_ID, phoneNumber: PHONE, balanceKes: 100, lifetimeCreditsEarnedKes: 100 });

    const ledger = await customerWalletRepository.getLedger(BUSINESS_ID, PHONE);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].data).toMatchObject({ type: 'milestone_bonus', amountKes: 100, balanceAfterKes: 100, orderId: 'order-1' });
  });

  it('accumulates balance and lifetime earned across multiple credits, newest ledger entry first', async () => {
    await adminFirestore.runTransaction((tx) =>
      customerWalletRepository.applyInTransaction(tx, BUSINESS_ID, PHONE, {
        type: 'milestone_bonus',
        amountKes: 100,
        note: 'first',
        orderId: null,
        createdBy: 'system',
      }),
    );
    await adminFirestore.runTransaction((tx) =>
      customerWalletRepository.applyInTransaction(tx, BUSINESS_ID, PHONE, {
        type: 'milestone_bonus',
        amountKes: 50,
        note: 'second',
        orderId: null,
        createdBy: 'system',
      }),
    );

    const wallet = await customerWalletRepository.get(BUSINESS_ID, PHONE);
    expect(wallet).toMatchObject({ balanceKes: 150, lifetimeCreditsEarnedKes: 150 });

    const ledger = await customerWalletRepository.getLedger(BUSINESS_ID, PHONE);
    expect(ledger.map((e) => e.data.note)).toEqual(['second', 'first']);
  });

  it('debits without reducing lifetimeCreditsEarnedKes', async () => {
    await adminFirestore.runTransaction((tx) =>
      customerWalletRepository.applyInTransaction(tx, BUSINESS_ID, PHONE, {
        type: 'milestone_bonus',
        amountKes: 200,
        note: 'credit',
        orderId: null,
        createdBy: 'system',
      }),
    );
    await adminFirestore.runTransaction((tx) =>
      customerWalletRepository.applyInTransaction(tx, BUSINESS_ID, PHONE, {
        type: 'checkout_redemption',
        amountKes: -80,
        note: 'redeemed',
        orderId: 'order-2',
        createdBy: 'system',
      }),
    );

    const wallet = await customerWalletRepository.get(BUSINESS_ID, PHONE);
    expect(wallet).toMatchObject({ balanceKes: 120, lifetimeCreditsEarnedKes: 200 });
  });

  it('throws InsufficientWalletBalanceError rather than going negative, and writes nothing', async () => {
    await adminFirestore.runTransaction((tx) =>
      customerWalletRepository.applyInTransaction(tx, BUSINESS_ID, PHONE, {
        type: 'milestone_bonus',
        amountKes: 50,
        note: 'credit',
        orderId: null,
        createdBy: 'system',
      }),
    );

    await expect(
      adminFirestore.runTransaction((tx) =>
        customerWalletRepository.applyInTransaction(tx, BUSINESS_ID, PHONE, {
          type: 'checkout_redemption',
          amountKes: -100,
          note: 'over-redeem',
          orderId: 'order-3',
          createdBy: 'system',
        }),
      ),
    ).rejects.toBeInstanceOf(InsufficientWalletBalanceError);

    const wallet = await customerWalletRepository.get(BUSINESS_ID, PHONE);
    expect(wallet?.balanceKes).toBe(50);
    const ledger = await customerWalletRepository.getLedger(BUSINESS_ID, PHONE);
    expect(ledger).toHaveLength(1);
  });

  it('keeps two businesses fully isolated even for the same phone number', async () => {
    await adminFirestore.runTransaction((tx) =>
      customerWalletRepository.applyInTransaction(tx, BUSINESS_ID, PHONE, {
        type: 'milestone_bonus',
        amountKes: 100,
        note: 'sq',
        orderId: null,
        createdBy: 'system',
      }),
    );
    await adminFirestore.runTransaction((tx) =>
      customerWalletRepository.applyInTransaction(tx, OTHER_BUSINESS_ID, PHONE, {
        type: 'milestone_bonus',
        amountKes: 999,
        note: 'other',
        orderId: null,
        createdBy: 'system',
      }),
    );

    expect((await customerWalletRepository.get(BUSINESS_ID, PHONE))?.balanceKes).toBe(100);
    expect((await customerWalletRepository.get(OTHER_BUSINESS_ID, PHONE))?.balanceKes).toBe(999);
  });
});

describe('CustomerWalletRepository.listByBusiness', () => {
  it('lists wallets for a business, highest balance first', async () => {
    await adminFirestore.runTransaction((tx) =>
      customerWalletRepository.applyInTransaction(tx, BUSINESS_ID, '254700000001', {
        type: 'milestone_bonus',
        amountKes: 50,
        note: 'a',
        orderId: null,
        createdBy: 'system',
      }),
    );
    await adminFirestore.runTransaction((tx) =>
      customerWalletRepository.applyInTransaction(tx, BUSINESS_ID, '254700000002', {
        type: 'milestone_bonus',
        amountKes: 500,
        note: 'b',
        orderId: null,
        createdBy: 'system',
      }),
    );

    const wallets = await customerWalletRepository.listByBusiness(BUSINESS_ID);
    expect(wallets.map((w) => w.data.balanceKes)).toEqual([500, 50]);
  });
});

describe('walletId', () => {
  it('is deterministic per business + phone number', () => {
    expect(walletId(BUSINESS_ID, PHONE)).toBe(`${BUSINESS_ID}:${PHONE}`);
  });
});
