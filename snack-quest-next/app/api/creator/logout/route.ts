import { stringifySetCookie } from 'cookie';
import { CREATOR_SESSION_COOKIE } from '@/lib/auth/cookieName';

/** Clears the creator session cookie for this browser only — other devices/sessions stay signed in. */
export async function POST(): Promise<Response> {
  const response = Response.json({ ok: true });
  response.headers.append(
    'Set-Cookie',
    stringifySetCookie({
      name: CREATOR_SESSION_COOKIE,
      value: '',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    }),
  );
  return response;
}
