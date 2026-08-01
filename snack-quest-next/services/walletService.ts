import 'server-only';

import { adminFirestore } from '@/lib/firebase/admin';
import { businessRepository } from '@/repositories/businessRepository';
import { orderRepository } from '@/repositories/orderRepository';
import { customerWalletRepository, InsufficientWalletBalanceError } from '@/repositories/customerWalletRepository';
import type { CustomerWallet, WalletLedgerEntry, WalletLedgerEntryType } from '@/types';

export { InsufficientWalletBalanceError };

export class WalletValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletValidationError';
  }
}

export interface WalletBalance {
  balanceKes: number;
  lifetimeCreditsEarnedKes: number;
}

export interface MilestoneAwardResult {
  awarded: boolean;
  amountKes: number;
  reason: 'first_order' | 'repeat_order' | null;
}

const NO_BALANCE: WalletBalance = { balanceKes: 0, lifetimeCreditsEarnedKes: 0 };

function toBalance(wallet: CustomerWallet | null): WalletBalance {
  return wallet ? { balanceKes: wallet.balanceKes, lifetimeCreditsEarnedKes: wallet.lifetimeCreditsEarnedKes } : NO_BALANCE;
}

/**
 * Owns the customer loyalty / Quest wallet (§ Phase 4). Keyed by
 * phone number throughout, not a Firebase Auth uid — see
 * `types/customerWallet.ts`'s own doc comment for why. Two kinds of
 * writes: `awardMilestoneIfEligible()` (automatic, business-policy
 * driven, gated by `Business.loyaltyConfig`) and `redeemAtCheckout()` /
 * `adjust()` (spending or manually correcting an existing balance,
 * which works even while `loyaltyConfig` is disabled — turning off
 * future earning should never freeze money a customer already has).
 */
class WalletService {
  async getBalance(businessId: string, phoneNumber: string): Promise<WalletBalance> {
    return toBalance(await customerWalletRepository.get(businessId, phoneNumber));
  }

  async getLedger(businessId: string, phoneNumber: string, limit?: number) {
    return customerWalletRepository.getLedger(businessId, phoneNumber, limit);
  }

  async listWallets(businessId: string) {
    return customerWalletRepository.listByBusiness(businessId);
  }

  /** How much of `desiredKes` the customer's current balance can actually cover — never more than what's available. */
  async redeemableAmount(businessId: string, phoneNumber: string, desiredKes: number): Promise<number> {
    if (desiredKes <= 0) {
      return 0;
    }
    const { balanceKes } = await this.getBalance(businessId, phoneNumber);
    return Math.min(balanceKes, desiredKes);
  }

  /** Debits a checkout redemption — called only once the order it was quoted against has actually paid (§ ConversationService.completeOrder). */
  async redeemAtCheckout(businessId: string, phoneNumber: string, amountKes: number, orderId: string): Promise<void> {
    if (amountKes <= 0) {
      return;
    }
    await adminFirestore.runTransaction((tx) =>
      customerWalletRepository.applyInTransaction(tx, businessId, phoneNumber, {
        type: 'checkout_redemption',
        amountKes: -amountKes,
        note: `Applied to order ${orderId}`,
        orderId,
        createdBy: 'system',
      }),
    );
  }

  /** A staff-initiated correction — a goodwill credit, or fixing a mistake. Positive `amountKes` credits, negative debits (throws `InsufficientWalletBalanceError` if that would go negative). */
  async adjust(businessId: string, phoneNumber: string, amountKes: number, note: string, actor: string): Promise<WalletBalance> {
    if (!Number.isFinite(amountKes) || amountKes === 0) {
      throw new WalletValidationError('"amountKes" must be a non-zero number.');
    }
    if (!note.trim()) {
      throw new WalletValidationError('A note is required for a manual wallet adjustment.');
    }
    const balanceAfterKes = await adminFirestore.runTransaction((tx) =>
      customerWalletRepository.applyInTransaction(tx, businessId, phoneNumber, {
        type: 'admin_adjustment',
        amountKes,
        note: note.trim(),
        orderId: null,
        createdBy: actor,
      }),
    );
    const wallet = await customerWalletRepository.get(businessId, phoneNumber);
    return { balanceKes: balanceAfterKes, lifetimeCreditsEarnedKes: wallet?.lifetimeCreditsEarnedKes ?? 0 };
  }

  /**
   * Fired once per completed order (§ ConversationService.completeOrder,
   * best-effort — never undoes a paid order if this fails). No-op if
   * `Business.loyaltyConfig` is absent or disabled — no default bonus
   * amounts are ever guessed (see `LoyaltyConfig`'s own doc comment).
   * `paidOrderCount` is this order's 1-indexed position among the
   * customer's paid orders (1 = their first-ever paid order).
   */
  async awardMilestoneIfEligible(
    businessId: string,
    phoneNumber: string,
    orderId: string,
    paidOrderCount: number,
  ): Promise<MilestoneAwardResult> {
    const business = await businessRepository.findById(businessId);
    const config = business?.loyaltyConfig;
    if (!config?.enabled) {
      return { awarded: false, amountKes: 0, reason: null };
    }

    let amountKes = 0;
    let reason: MilestoneAwardResult['reason'] = null;
    const type: WalletLedgerEntryType = 'milestone_bonus';
    if (paidOrderCount === 1 && config.firstOrderBonusKes > 0) {
      amountKes = config.firstOrderBonusKes;
      reason = 'first_order';
    } else if (
      config.repeatOrderIntervalCount > 0 &&
      config.repeatOrderBonusKes > 0 &&
      paidOrderCount > 1 &&
      paidOrderCount % config.repeatOrderIntervalCount === 0
    ) {
      amountKes = config.repeatOrderBonusKes;
      reason = 'repeat_order';
    }

    if (amountKes <= 0 || !reason) {
      return { awarded: false, amountKes: 0, reason: null };
    }

    const note =
      reason === 'first_order'
        ? 'Welcome bonus — first paid order'
        : `Loyalty bonus — order #${paidOrderCount}`;

    await adminFirestore.runTransaction((tx) =>
      customerWalletRepository.applyInTransaction(tx, businessId, phoneNumber, {
        type,
        amountKes,
        note,
        orderId,
        createdBy: 'system',
      }),
    );

    return { awarded: true, amountKes, reason };
  }

  /**
   * How many paid orders this phone number has, this order included —
   * used to decide milestone eligibility. Every `orders` doc is
   * already payment-confirmed (`OrderService.createFromConversationSnapshot`
   * is the only writer, only ever called post-payment-success), so a
   * plain count is correct. A generous limit, not
   * `searchByPhoneNumber`'s admin-search default of 25 — a genuinely
   * loyal customer's 30th order must still be recognized as a
   * milestone, not silently capped.
   */
  async countPaidOrders(businessId: string, phoneNumber: string): Promise<number> {
    const orders = await orderRepository.searchByPhoneNumber(businessId, phoneNumber, 1000);
    return orders.length;
  }
}

export const walletService = new WalletService();
export { WalletService };
export type { WalletLedgerEntry };
