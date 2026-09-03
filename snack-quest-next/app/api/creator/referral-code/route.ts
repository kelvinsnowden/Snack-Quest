import { referralCodeService } from '@/services/referralCodeService';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';

/**
 * `GET /api/creator/referral-code?code=SNACKS` — is this code free?
 * (§ creators choose their own code)
 *
 * Public, because the one place it is needed is the sign-up form,
 * where the person asking does not have a creator account yet — that
 * is the whole point of the question.
 *
 * It answers "taken" or "free" and nothing else: never who holds a
 * code, never how many exist. A referral code is semi-public anyway
 * (creators put them in posts), so the only thing worth withholding
 * is the mapping from code to person, and this endpoint does not have
 * it to give.
 *
 * `no-store`, because a cached "available" is the one answer that
 * could send somebody confidently to a sign-up that then fails.
 */
export async function GET(request: Request): Promise<Response> {
  const code = new URL(request.url).searchParams.get('code') ?? '';
  if (!code.trim()) {
    return Response.json({ error: 'code is required' }, { status: 400 });
  }

  const result = await referralCodeService.checkAvailability(getCurrentBusinessId(), code);

  return Response.json(result, { headers: { 'cache-control': 'no-store' } });
}
