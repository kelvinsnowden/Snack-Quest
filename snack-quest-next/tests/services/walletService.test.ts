import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { businessRepository, type BusinessInput } from '@/repositories/businessRepository';
import { walletService, WalletValidationError } from '@/services/walletService';
import { InsufficientWalletBalanceError } from '@/repositories/customerWalletRepository';

const BUSINESS_ID = 'biz-wallet-service-test';
const PHONE = '254700000010';

const BASE_INPUT: BusinessInput = {
  name: 'Snack Quest',
  currency: 'KES',
  whatsappPhoneNumberId: 'wa-phone-1',
  countyCoverage: ['Nairobi'],
  adminWhatsappPhone: null,
  whatsappCustomerNumber: null,
  status: 'active',
};

async function setLoyaltyConfig(config: BusinessInput['loyaltyConfig']) {
  await businessRepository.update(BUSINESS_ID, { loyaltyConfig: config }, 'system');
}

beforeEach(async () => {
  await Promise.all([
    adminFirestore.recursiveDelete(adminFirestore.collection('customerWallets')),
    adminFirestore.recursiveDelete(adminFirestore.collection('businesses')),
    adminFirestore.recursiveDelete(adminFirestore.collection('orders')),
  ]);
  await businessRepository.create(BUSINESS_ID, BASE_INPUT, 'system');
});

describe('WalletService.getBalance / redeemableAmount', () => {
  it('returns a zero balance for a customer with no wallet yet', async () => {
    expect(await walletService.getBalance(BUSINESS_ID, PHONE)).toEqual({ balanceKes: 0, lifetimeCreditsEarnedKes: 0 });
    expect(await walletService.redeemableAmount(BUSINESS_ID, PHONE, 1000)).toBe(0);
  });

  it('caps redeemableAmount at the lesser of balance and the desired amount', async () => {
    await walletService.adjust(BUSINESS_ID, PHONE, 300, 'seed', 'system');
    expect(await walletService.redeemableAmount(BUSINESS_ID, PHONE, 1000)).toBe(300);
    expect(await walletService.redeemableAmount(BUSINESS_ID, PHONE, 100)).toBe(100);
    expect(await walletService.redeemableAmount(BUSINESS_ID, PHONE, 0)).toBe(0);
    expect(await walletService.redeemableAmount(BUSINESS_ID, PHONE, -50)).toBe(0);
  });
});

describe('WalletService.adjust', () => {
  it('credits and debits with a required note', async () => {
    await walletService.adjust(BUSINESS_ID, PHONE, 200, 'goodwill credit', 'staff-1');
    const balance = await walletService.adjust(BUSINESS_ID, PHONE, -50, 'correcting a mistake', 'staff-1');
    expect(balance.balanceKes).toBe(150);
  });

  it('rejects a zero amount', async () => {
    await expect(walletService.adjust(BUSINESS_ID, PHONE, 0, 'note', 'staff-1')).rejects.toBeInstanceOf(WalletValidationError);
  });

  it('rejects a blank note', async () => {
    await expect(walletService.adjust(BUSINESS_ID, PHONE, 100, '  ', 'staff-1')).rejects.toBeInstanceOf(WalletValidationError);
  });

  it('throws InsufficientWalletBalanceError for a debit larger than the balance', async () => {
    await walletService.adjust(BUSINESS_ID, PHONE, 50, 'seed', 'staff-1');
    await expect(walletService.adjust(BUSINESS_ID, PHONE, -100, 'over-debit', 'staff-1')).rejects.toBeInstanceOf(
      InsufficientWalletBalanceError,
    );
  });
});

describe('WalletService.redeemAtCheckout', () => {
  it('debits the balance and tags the ledger entry with the order id', async () => {
    await walletService.adjust(BUSINESS_ID, PHONE, 300, 'seed', 'system');
    await walletService.redeemAtCheckout(BUSINESS_ID, PHONE, 120, 'order-1');

    expect((await walletService.getBalance(BUSINESS_ID, PHONE)).balanceKes).toBe(180);
    const ledger = await walletService.getLedger(BUSINESS_ID, PHONE);
    expect(ledger[0].data).toMatchObject({ type: 'checkout_redemption', amountKes: -120, orderId: 'order-1' });
  });

  it('is a no-op for a zero or negative amount', async () => {
    await walletService.adjust(BUSINESS_ID, PHONE, 100, 'seed', 'system');
    await walletService.redeemAtCheckout(BUSINESS_ID, PHONE, 0, 'order-1');
    expect((await walletService.getBalance(BUSINESS_ID, PHONE)).balanceKes).toBe(100);
  });
});

describe('WalletService.awardMilestoneIfEligible', () => {
  it('is a no-op when loyaltyConfig is absent', async () => {
    const result = await walletService.awardMilestoneIfEligible(BUSINESS_ID, PHONE, 'order-1', 1);
    expect(result).toEqual({ awarded: false, amountKes: 0, reason: null });
    expect((await walletService.getBalance(BUSINESS_ID, PHONE)).balanceKes).toBe(0);
  });

  it('is a no-op when loyaltyConfig.enabled is false, even with real bonus amounts configured', async () => {
    await setLoyaltyConfig({ enabled: false, firstOrderBonusKes: 100, repeatOrderIntervalCount: 5, repeatOrderBonusKes: 50 });
    const result = await walletService.awardMilestoneIfEligible(BUSINESS_ID, PHONE, 'order-1', 1);
    expect(result.awarded).toBe(false);
  });

  it('awards the first-order bonus exactly once, on paidOrderCount 1', async () => {
    await setLoyaltyConfig({ enabled: true, firstOrderBonusKes: 100, repeatOrderIntervalCount: 5, repeatOrderBonusKes: 50 });
    const result = await walletService.awardMilestoneIfEligible(BUSINESS_ID, PHONE, 'order-1', 1);
    expect(result).toEqual({ awarded: true, amountKes: 100, reason: 'first_order' });
    expect((await walletService.getBalance(BUSINESS_ID, PHONE)).balanceKes).toBe(100);
  });

  it('awards the repeat-order bonus only on interval multiples, not every order', async () => {
    await setLoyaltyConfig({ enabled: true, firstOrderBonusKes: 0, repeatOrderIntervalCount: 5, repeatOrderBonusKes: 50 });

    expect((await walletService.awardMilestoneIfEligible(BUSINESS_ID, PHONE, 'o2', 2)).awarded).toBe(false);
    expect((await walletService.awardMilestoneIfEligible(BUSINESS_ID, PHONE, 'o4', 4)).awarded).toBe(false);
    const fifth = await walletService.awardMilestoneIfEligible(BUSINESS_ID, PHONE, 'o5', 5);
    expect(fifth).toEqual({ awarded: true, amountKes: 50, reason: 'repeat_order' });
    expect((await walletService.awardMilestoneIfEligible(BUSINESS_ID, PHONE, 'o9', 9)).awarded).toBe(false);
    const tenth = await walletService.awardMilestoneIfEligible(BUSINESS_ID, PHONE, 'o10', 10);
    expect(tenth).toEqual({ awarded: true, amountKes: 50, reason: 'repeat_order' });

    expect((await walletService.getBalance(BUSINESS_ID, PHONE)).balanceKes).toBe(100);
  });

  it('does not award a zero-configured bonus', async () => {
    await setLoyaltyConfig({ enabled: true, firstOrderBonusKes: 0, repeatOrderIntervalCount: 5, repeatOrderBonusKes: 0 });
    expect((await walletService.awardMilestoneIfEligible(BUSINESS_ID, PHONE, 'o1', 1)).awarded).toBe(false);
    expect((await walletService.awardMilestoneIfEligible(BUSINESS_ID, PHONE, 'o5', 5)).awarded).toBe(false);
  });
});
