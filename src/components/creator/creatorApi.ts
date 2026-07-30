/**
 * Typed client for the real Creator module API (src/modules/creators/*).
 * This is the only place that should know these endpoint shapes — keeps the
 * portal honest about what the backend actually supports instead of each
 * screen guessing at a payload.
 */

export interface CreatorAccount {
  id: string;
  full_name: string;
  referral_code: string;
  status: string;
  tier: string;
  [key: string]: unknown;
}

export interface CreatorWallet {
  total_earnings_kes: number;
  available_balance_kes: number;
  pending_payouts_kes: number;
}

export interface CreatorAnalyticsSummary {
  total_clicks: number;
  conversions: number;
  conversion_rate_pct: number;
}

export interface CampaignSubmission {
  id: string;
  creator_id: string;
  status: string;
  [key: string]: unknown;
}

export interface WithdrawalRecord {
  id: string;
  creator_id: string;
  creator_name: string;
  phone_number: string;
  amount_kes: number;
  status: 'pending' | 'approved' | 'rejected' | 'paid' | string;
  created_at: string;
  updated_at: string;
}

export interface CreatorDashboardPayload {
  creator: CreatorAccount;
  referral_link: string;
  wallet: CreatorWallet;
  analytics: CreatorAnalyticsSummary;
  campaign_submissions: CampaignSubmission[];
  withdrawal_history: WithdrawalRecord[];
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Unexpected response from server');
  }
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error?.message || body?.message || 'Request failed');
  }
  return (body?.data ?? body) as T;
}

export async function fetchCreatorDashboard(creatorId: string): Promise<CreatorDashboardPayload> {
  const res = await fetch(`/api/v1/creators/dashboard?creator_id=${encodeURIComponent(creatorId)}`);
  return parseJsonResponse<CreatorDashboardPayload>(res);
}

export async function requestCreatorMagicLogin(identifier: string): Promise<{ message: string; expires_in_minutes: number }> {
  const isEmail = identifier.includes('@');
  const res = await fetch('/api/v1/creators/magic-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(isEmail ? { email: identifier } : { phone: identifier })
  });
  return parseJsonResponse(res);
}

export async function requestCreatorWithdrawal(amountKes: number, phone: string): Promise<WithdrawalRecord> {
  const res = await fetch('/api/v1/creators/withdraw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount_kes: amountKes, phone })
  });
  return parseJsonResponse<WithdrawalRecord>(res);
}

export const CREATOR_SESSION_KEY = 'sq_creator_session';

export function loadStoredCreatorId(): string | null {
  try {
    const raw = localStorage.getItem(CREATOR_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.creator_id || null;
  } catch {
    return null;
  }
}

export function storeCreatorId(creatorId: string) {
  localStorage.setItem(CREATOR_SESSION_KEY, JSON.stringify({ creator_id: creatorId }));
}

export function clearStoredCreatorId() {
  localStorage.removeItem(CREATOR_SESSION_KEY);
}
