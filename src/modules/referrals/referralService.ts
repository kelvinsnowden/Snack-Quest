import { getDb, saveDb, generateUuid, getNowIso } from '../../api/repositories/dbRepository';

export class ReferralService {
  static getReferralsByCustomer(customerId: string) {
    const db = getDb();
    const customer = db.customers?.find((c) => c.id === customerId);
    const refCode = customer?.referral_code || 'WANJ123';
    const referrals = db.referrals?.filter((r) => r.referrer_customer_id === customerId) || [];

    return {
      customer_id: customerId,
      referral_code: refCode,
      referral_link: `https://snackquests.shop/join?ref=${refCode}`,
      total_invited: referrals.length,
      qualified_referrals: referrals.filter((r) => r.status === 'qualified').length,
      pending_referrals: referrals.filter((r) => r.status === 'pending').length,
      referrals_list: referrals,
    };
  }

  static createReferralInvite(referrerId: string, refereeEmail: string, refereeName?: string) {
    const db = getDb();
    const refId = `ref-${generateUuid().substring(0, 8)}`;
    const now = getNowIso();

    const referralRecord = {
      id: refId,
      referrer_customer_id: referrerId,
      referee_name: refereeName || 'Friend',
      referee_email: refereeEmail,
      status: 'pending' as const,
      commission_kes: 500,
      created_at: now,
      updated_at: now,
    };

    if (!db.referrals) db.referrals = [];
    db.referrals.unshift(referralRecord as any);

    saveDb();
    return referralRecord;
  }
}
