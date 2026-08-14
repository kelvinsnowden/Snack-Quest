/**
 * The smallest amount a creator can request in a single withdrawal
 * (§ Creator Portal withdrawals). Set to exactly one referral
 * commission (`CREATOR_COMMISSION_KES`, lib/creators/referralEconomics.ts)
 * on purpose: campaign rewards alone top out at KES 250, so a creator
 * who has only ever earned from campaigns can't cash out — they have
 * to convert one real referral sale first. Enforced in
 * `WithdrawalService.requestWithdrawal`, not in Firestore Security
 * Rules, the same layer every other withdrawal business rule
 * (balance reservation, creator eligibility) already lives in.
 */
export const MIN_WITHDRAWAL_KES = 300;
