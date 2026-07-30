import { getDb, saveDb, generateUuid, getNowIso, addAuditLog } from '../../api/repositories/dbRepository';
import { WalletTransaction } from '../../types/database';

export class WalletService {
  static getWallet(customerId: string) {
    const db = getDb();
    const customer = db.customers?.find((c) => c.id === customerId);
    const txs = db.wallet_transactions?.filter((w) => w.customer_id === customerId) || [];

    const balanceCents = txs.reduce((acc, curr) => acc + curr.amount, 0);

    return {
      customer_id: customerId,
      customer_name: customer?.full_name || 'Quest Member',
      balance_points: Math.max(0, Math.floor(balanceCents / 100)),
      balance_kes: Math.max(0, balanceCents / 100),
      transactions: txs,
    };
  }

  static creditWallet(customerId: string, points: number, reason: string) {
    const db = getDb();
    const txId = `wtx-${generateUuid().substring(0, 8)}`;
    const now = getNowIso();
    const amountCents = points * 100; // 1 point = 1 KES = 100 cents

    const txs = db.wallet_transactions?.filter((w) => w.customer_id === customerId) || [];
    const currentBalanceCents = txs.reduce((acc, curr) => acc + curr.amount, 0);

    const tx: WalletTransaction = {
      id: txId,
      customer_id: customerId,
      amount: amountCents,
      transaction_type: 'manual_adjustment',
      source_reward_submission_id: null,
      source_referral_id: null,
      source_order_id: null,
      balance_after: currentBalanceCents + amountCents,
      created_by: 'wallet-service',
      note: reason || 'Quest Credit Reward',
      created_at: now,
      updated_at: now,
    };

    if (!db.wallet_transactions) db.wallet_transactions = [];
    db.wallet_transactions.unshift(tx);

    addAuditLog('system', 'wallet-service', 'Wallet Module', 'wallet_credited', 'wallet', customerId, `Credited ${points} points to ${customerId}`);
    saveDb();

    return this.getWallet(customerId);
  }

  static redeemWallet(customerId: string, points: number, redemptionType = 'voucher') {
    const db = getDb();
    const current = this.getWallet(customerId);

    if (current.balance_points < points) {
      throw new Error(`Insufficient wallet balance. Requested: ${points}, Available: ${current.balance_points}`);
    }

    const txId = `wtx-${generateUuid().substring(0, 8)}`;
    const now = getNowIso();
    const debitCents = -1 * points * 100;

    const txs = db.wallet_transactions?.filter((w) => w.customer_id === customerId) || [];
    const currentBalanceCents = txs.reduce((acc, curr) => acc + curr.amount, 0);

    const tx: WalletTransaction = {
      id: txId,
      customer_id: customerId,
      amount: debitCents,
      transaction_type: 'redeemed_on_order',
      source_reward_submission_id: null,
      source_referral_id: null,
      source_order_id: null,
      balance_after: currentBalanceCents + debitCents,
      created_by: customerId,
      note: `Redeemed ${points} Quest Credits for ${redemptionType}`,
      created_at: now,
      updated_at: now,
    };

    if (!db.wallet_transactions) db.wallet_transactions = [];
    db.wallet_transactions.unshift(tx);

    const voucherCode = `QUEST-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    addAuditLog('user', customerId, 'Wallet Module', 'wallet_redeemed', 'wallet', customerId, `Redeemed ${points} points for ${redemptionType}`);
    saveDb();

    return {
      success: true,
      voucher_code: voucherCode,
      redeemed_points: points,
      equivalent_kes: points,
      updated_wallet: this.getWallet(customerId),
    };
  }
}
