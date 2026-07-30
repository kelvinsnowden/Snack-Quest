import { getDb, saveDb, generateUuid, getNowIso, addAuditLog } from '../../api/repositories/dbRepository';

export class CreatorService {
  static getCreatorDashboard(creatorId: string) {
    const db = getDb();
    const creator = (db as any).creator_accounts?.find((c: any) => c.id === creatorId || c.email === creatorId || c.phone === creatorId) ||
                    db.creators?.find((c) => c.id === creatorId || c.code === creatorId);

    const refCode = creator?.referral_code || creator?.code || 'AMINA10';
    const withdrawals = (db as any).affiliate_withdrawals?.filter((w: any) => w.creator_id === creatorId) || [];
    const submissions = (db as any).campaign_submissions?.filter((s: any) => s.creator_id === creatorId) || [];

    return {
      creator: creator || {
        id: creatorId,
        full_name: 'Amina Snacks',
        referral_code: refCode,
        status: 'active',
        tier: 'Gold Creator',
      },
      referral_link: `https://snackquests.shop/?ref=${refCode}`,
      wallet: {
        total_earnings_kes: 45000,
        available_balance_kes: 12500,
        pending_payouts_kes: 5000,
      },
      analytics: {
        total_clicks: 1420,
        conversions: 84,
        conversion_rate_pct: 5.9,
      },
      campaign_submissions: submissions,
      withdrawal_history: withdrawals,
    };
  }

  static requestMagicLogin(emailOrPhone: string) {
    const magicToken = `mag_${generateUuid().substring(0, 12)}`;
    const magicLink = `https://creators.snackquests.shop/auth/verify?token=${magicToken}`;

    return {
      magic_token: magicToken,
      magic_link: magicLink,
      expires_in_minutes: 15,
      message: 'Magic login link dispatched successfully to creator contact.',
    };
  }

  static requestWithdrawal(creatorId: string, amountKes: number, phone: string) {
    const db = getDb();
    const withdrawalId = `wd-${generateUuid().substring(0, 8)}`;
    const now = getNowIso();

    const withdrawal = {
      id: withdrawalId,
      creator_id: creatorId,
      creator_name: 'Creator Partner',
      phone_number: phone,
      amount_kes: amountKes,
      status: 'pending' as const,
      created_at: now,
      updated_at: now,
    };

    if (!(db as any).affiliate_withdrawals) {
      (db as any).affiliate_withdrawals = [];
    }
    (db as any).affiliate_withdrawals.unshift(withdrawal);

    addAuditLog('user', creatorId, 'Creator Module', 'withdrawal_requested', 'withdrawal', withdrawalId, `Requested payout KES ${amountKes} via M-Pesa to ${phone}`);
    saveDb();

    return withdrawal;
  }
}
