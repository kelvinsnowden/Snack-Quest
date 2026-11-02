import { partnerPortalAccessService, PortalAccessError } from '@/services/partnerPortalAccessService';

/**
 * Creates (or replaces) an owner's Owner Portal password from the one-time
 * link Snack Quest emailed them. The token in the link is the proof; the
 * answer is the email they now sign in with.
 */
export async function POST(request: Request): Promise<Response> {
  let token = '';
  let password = '';
  try {
    const body = (await request.json()) as { token?: unknown; password?: unknown };
    token = typeof body.token === 'string' ? body.token : '';
    password = typeof body.password === 'string' ? body.password : '';
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  try {
    return Response.json(await partnerPortalAccessService.setPassword(token, password));
  } catch (error) {
    if (error instanceof PortalAccessError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
