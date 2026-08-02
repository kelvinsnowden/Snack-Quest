import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseSetCookie } from 'cookie';
import { adminAuth, adminFirestore } from '@/lib/firebase/admin';
import { businessRepository } from '@/repositories/businessRepository';
import { userRepository } from '@/repositories/userRepository';
import { staffRepository } from '@/repositories/staffRepository';
import { staffAuthService } from '@/services/staffAuthService';
import { STAFF_SESSION_COOKIE } from '@/lib/auth/cookieName';
import { POST as sessionRoute } from '@/app/api/auth/session/route';
import { POST as logoutRoute } from '@/app/api/auth/logout/route';
import { getIdTokenForUid } from '../helpers/authEmulator';

/**
 * The actual HTTP wire for staff login/logout (§ Admin auth
 * foundation) — real Route Handler functions, real Set-Cookie headers,
 * verified by feeding the issued cookie back through
 * `staffAuthService.verifySessionCookie()` exactly as
 * `requireStaffSession()` would.
 */

const BUSINESS_ID = 'biz-admin-auth-routes-test';
const createdUids: string[] = [];

async function cleanCollections() {
  for (const name of ['businesses', 'users', 'staffProfiles']) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(name));
  }
}

function sessionRequest(idToken: unknown): Request {
  return new Request('http://localhost/api/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
}

beforeEach(async () => {
  await cleanCollections();
  await businessRepository.create(
    BUSINESS_ID,
    {
      name: 'Admin Auth Routes Test Biz',
      currency: 'KES',
      whatsappPhoneNumberId: 'wa-admin-auth-routes-test',
      countyCoverage: [],
      adminWhatsappPhone: null,
      whatsappCustomerNumber: null,
      status: 'active',
    },
    'system',
  );
});

afterEach(async () => {
  await Promise.all(
    createdUids.splice(0).map((uid) => adminAuth.deleteUser(uid).catch(() => undefined)),
  );
});

describe('POST /api/auth/session', () => {
  it('rejects a malformed body', async () => {
    const response = await sessionRoute(
      new Request('http://localhost/api/auth/session', { method: 'POST', body: 'not json' }),
    );
    expect(response.status).toBe(400);
  });

  it('rejects a missing idToken', async () => {
    const response = await sessionRoute(sessionRequest(undefined));
    expect(response.status).toBe(400);
  });

  it('403s a real Firebase Auth success from a non-provisioned user', async () => {
    const record = await adminAuth.createUser({ email: 'walkin@example.com', password: 'test-password-123' });
    createdUids.push(record.uid);
    const idToken = await getIdTokenForUid(record.uid);

    const response = await sessionRoute(sessionRequest(idToken));
    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('issues a real httpOnly session cookie for a provisioned staff account', async () => {
    const record = await adminAuth.createUser({ email: 'finance@example.com', password: 'test-password-123' });
    createdUids.push(record.uid);
    await userRepository.create(
      record.uid,
      { email: 'finance@example.com', roles: ['finance'], displayName: 'Fatima Finance', photoURL: null },
      'system',
    );
    await staffRepository.create(
      record.uid,
      { businessId: BUSINESS_ID, role: 'finance', permissions: [], department: 'Finance' },
      'system',
    );
    const idToken = await getIdTokenForUid(record.uid);

    const response = await sessionRoute(sessionRequest(idToken));
    expect(response.status).toBe(200);

    const setCookieHeader = response.headers.get('set-cookie');
    expect(setCookieHeader).toBeTruthy();
    const parsed = parseSetCookie(setCookieHeader!);
    expect(parsed.name).toBe(STAFF_SESSION_COOKIE);
    expect(parsed.httpOnly).toBe(true);
    expect(parsed.sameSite).toBe('lax');
    expect(parsed.value).toBeTruthy();

    const body = (await response.json()) as { session: { uid: string; roles: string[] } };
    expect(body.session.uid).toBe(record.uid);
    expect(body.session.roles).toEqual(['finance']);

    // The exact cookie value this route issued verifies back to the same session.
    const verified = await staffAuthService.verifySessionCookie(parsed.value!);
    expect(verified?.uid).toBe(record.uid);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie', async () => {
    const response = await logoutRoute();
    expect(response.status).toBe(200);

    const setCookieHeader = response.headers.get('set-cookie');
    expect(setCookieHeader).toBeTruthy();
    const parsed = parseSetCookie(setCookieHeader!);
    expect(parsed.name).toBe(STAFF_SESSION_COOKIE);
    expect(parsed.maxAge).toBe(0);
  });
});
