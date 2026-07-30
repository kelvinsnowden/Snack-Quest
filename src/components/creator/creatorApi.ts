/**
 * Typed client for the real creator-facing backend in server.ts.
 *
 * This is NOT the sparse src/modules/creators module — it's the complete,
 * seeded creator-auth + affiliate-campaign system registered directly on
 * `app` in server.ts (search for `/api/v1/creator-auth` and
 * `/api/v1/creator/campaigns`). Identity is the `creator_accounts`
 * collection; wallet numbers (available_cash, pending_earnings,
 * lifetime_earnings, total_clicks, total_conversions) live directly on the
 * creator record returned by every auth call, not on a separate endpoint.
 */

export interface SocialHandles {
  tiktok?: string;
  instagram?: string;
  youtube?: string;
  facebook?: string;
  x?: string;
}

export interface CreatorAccount {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
  whatsapp_number: string;
  county: string;
  preferred_language: string;
  referral_code: string;
  status: 'pending_verification' | 'active' | 'suspended' | 'banned' | string;
  whatsapp_verified: boolean;
  onboarding_completed: boolean;
  current_step: number;
  tier: string;
  bio: string;
  social_handles: SocialHandles;
  niche: string;
  followers_range: string;
  payment_preference: string;
  created_at: string;
  last_login_at: string;
  available_cash: number;
  pending_earnings: number;
  lifetime_earnings: number;
  total_clicks: number;
  total_conversions: number;
}

export interface Campaign {
  id: string;
  title: string;
  status: string;
  commission_rate_kes: number;
  rules: string;
  assets_url: string;
  deadline: string;
  cta_text: string;
  brand_guidelines: string;
  target_niche: string;
  created_at: string;
}

export interface CampaignSubmission {
  id: string;
  campaign_id: string;
  campaign_title: string;
  creator_id: string;
  creator_name: string;
  submission_type: 'image' | 'video' | 'document' | 'social_link' | string;
  file_url: string;
  file_name: string;
  social_link: string;
  notes: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  admin_feedback: string;
}

export interface WithdrawalRecord {
  id: string;
  creator_id: string;
  phone_number: string;
  amount_kes: number;
  status: 'pending' | 'approved' | 'rejected' | 'paid' | string;
  created_at: string;
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Unexpected response from server');
  }
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error || body?.message || 'Request failed');
  }
  return body as T;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseJsonResponse<T>(res);
}

// --- Auth ---

export interface RegisterPayload {
  first_name: string;
  last_name: string;
  whatsapp_number: string;
  email: string;
  password: string;
  county?: string;
  preferred_language?: string;
  referral_code?: string;
  terms_accepted: boolean;
  marketing_consent?: boolean;
}

export function registerCreator(payload: RegisterPayload) {
  return postJson<{ success: true; message: string; creator_id: string; whatsapp_number: string; otp_code_demo: string; expires_in_sec: number }>(
    '/api/v1/creator-auth/register',
    payload
  );
}

export function verifyCreatorOtp(creatorId: string, otpCode: string) {
  return postJson<{ success: true; message: string; creator: CreatorAccount; session_token: string }>('/api/v1/creator-auth/verify-otp', {
    creator_id: creatorId,
    otp_code: otpCode
  });
}

export function loginCreator(loginIdentifier: string, password: string, rememberMe = true) {
  return postJson<{ success: true; creator: CreatorAccount; session_token: string }>('/api/v1/creator-auth/login', {
    login_identifier: loginIdentifier,
    password,
    remember_me: rememberMe
  });
}

export function requestMagicLink(whatsappNumber: string) {
  return postJson<{ success: true; magic_token: string; magic_link: string; message: string }>('/api/v1/creator-auth/magic-login-request', {
    whatsapp_number: whatsappNumber
  });
}

export async function consumeMagicLink(token: string) {
  const res = await fetch(`/api/v1/creator-auth/magic-login?token=${encodeURIComponent(token)}`);
  return parseJsonResponse<{ success: true; creator: CreatorAccount; session_token: string }>(res);
}

export interface OnboardingPayload {
  creator_id: string;
  bio?: string;
  social_handles?: SocialHandles;
  niche?: string;
  followers_range?: string;
  payment_preference?: string;
  current_step: number;
}

export function updateCreatorOnboarding(payload: OnboardingPayload) {
  return postJson<{ success: true; message: string; creator: CreatorAccount }>('/api/v1/creator-auth/onboarding/complete', payload);
}

// --- Campaigns & submissions ---

export async function fetchCampaigns() {
  const res = await fetch('/api/v1/creator/campaigns');
  const body = await parseJsonResponse<{ data: Campaign[] }>(res);
  return body.data;
}

export async function fetchCampaignSubmissions(creatorId: string) {
  const res = await fetch(`/api/v1/creator/campaign-submissions?creator_id=${encodeURIComponent(creatorId)}`);
  const body = await parseJsonResponse<{ data: CampaignSubmission[] }>(res);
  return body.data;
}

export interface SubmitDeliverablePayload {
  campaign_id: string;
  creator_id: string;
  creator_name: string;
  submission_type: 'image' | 'video' | 'document' | 'social_link';
  file_url?: string;
  file_name?: string;
  social_link?: string;
  notes?: string;
}

export function submitCampaignDeliverable(payload: SubmitDeliverablePayload) {
  return postJson<{ success: true; message: string; submission: CampaignSubmission }>('/api/v1/creator/campaign-submissions', payload);
}

// --- Withdrawals ---
// /api/v1/creators/withdraw + the withdrawal_history on /api/v1/creators/dashboard
// share the same affiliate_withdrawals records keyed by creator_id, so this pair
// is used purely for withdrawal history/actions (NOT for wallet totals, which
// come from the creator_accounts record itself — see fetchWithdrawalHistory below).

export function requestWithdrawal(creatorId: string, amountKes: number, phone: string) {
  return postJson<WithdrawalRecord>('/api/v1/creators/withdraw', { creator_id: creatorId, amount_kes: amountKes, phone });
}

export async function fetchWithdrawalHistory(creatorId: string) {
  const res = await fetch(`/api/v1/creators/dashboard?creator_id=${encodeURIComponent(creatorId)}`);
  const body = await parseJsonResponse<{ data: { withdrawal_history: WithdrawalRecord[] } }>(res);
  return body.data?.withdrawal_history || [];
}

export const CREATOR_SESSION_KEY = 'sq_creator_session';

export function loadStoredCreator(): CreatorAccount | null {
  try {
    const raw = localStorage.getItem(CREATOR_SESSION_KEY);
    return raw ? (JSON.parse(raw) as CreatorAccount) : null;
  } catch {
    return null;
  }
}

export function storeCreator(creator: CreatorAccount) {
  localStorage.setItem(CREATOR_SESSION_KEY, JSON.stringify(creator));
}

export function clearStoredCreator() {
  localStorage.removeItem(CREATOR_SESSION_KEY);
}
