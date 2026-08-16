import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminFirestore } from '@/lib/firebase/admin';
import { businessRepository } from '@/repositories/businessRepository';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { userRepository } from '@/repositories/userRepository';
import { staffRepository } from '@/repositories/staffRepository';
import { staffAuthService } from '@/services/staffAuthService';
import { STAFF_SESSION_COOKIE } from '@/lib/auth/cookieName';
import { POST as refundRoute } from '@/app/api/admin/orders/[orderId]/refund/route';
import { getIdTokenForUid } from '../helpers/authEmulator';
import { seedOrder } from '../helpers/orderFixtures';

/**
 * The Admin Orders refund-initiation wire (§ RefundService + Daraja
 * reversal support) end to end against the emulator: a real staff
 * session cookie, a real order document, real transition enforcement —
 * the Daraja HTTP call itself is stubbed (already covered by
 * tests/integrations/darajaGateway.test.ts and
 * tests/services/refundService.test.ts).
 */

const BUSINESS_ID = 'biz-admin-order-refund-route-test';
const createdUids: string[] = [];

const B2C_SECRET = {
  consumerKey: 'test-key',
  consumerSecret: 'test-secret',
  shortcode: '174379',
  accountType: 'till' as const,
  passkey: 'test-passkey',
  callbackUrl: `https://example.com/api/webhooks/daraja/${BUSINESS_ID}`,
  env: 'sandbox' as const,
  b2cInitiatorName: 'testapiuser',
  b2cSecurityCredential: 'encrypted-credential-base64',
};

function stubReversalSuccess() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/oauth/v1/generate')
          ? new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), { status: 200 })
          : new Response(
              JSON.stringify({
                ConversationID: 'conv-1',
                OriginatorConversationID: 'orig-1',
                ResponseCode: '0',
                ResponseDescription: 'Accept the service request successfully.',
              }),
              { status: 200 },
            ),
      ),
    ),
  );
}

async function cleanCollections() {
  for (const name of ['businesses', 'users', 'staffProfiles', 'orders', 'refunds', 'domainEvents']) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(name));
  }
}

async function staffSessionCookie(): Promise<string> {
  const record = await adminAuth.createUser({ email: `staff-${Date.now()}@example.com`, password: 'test-password-123' });
  createdUids.push(record.uid);
  await userRepository.create(
    record.uid,
    { email: record.email!, roles: ['admin'], displayName: 'Test Admin', photoURL: null },
    'system',
  );
  await staffRepository.create(
    record.uid,
    { businessId: BUSINESS_ID, role: 'admin', permissions: [], department: 'Operations' },
    'system',
  );
  const idToken = await getIdTokenForUid(record.uid);
  const { cookie } = await staffAuthService.establishSession(idToken);
  return cookie;
}

function refundRequest(orderId: string, cookie?: string): Request {
  return new Request(`http://localhost/api/admin/orders/${orderId}/refund`, {
    method: 'POST',
    headers: cookie ? { cookie: `${STAFF_SESSION_COOKIE}=${cookie}` } : {},
  });
}

beforeEach(async () => {
  await cleanCollections();
  await businessRepository.create(
    BUSINESS_ID,
    {
      name: 'Admin Order Refund Route Test Biz',
      currency: 'KES',
      whatsappPhoneNumberId: 'wa-admin-order-refund-route-test',
      countyCoverage: [],
      adminWhatsappPhone: null,
      whatsappCustomerNumber: null,
      status: 'active',
    },
    'system',
  );
  await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', B2C_SECRET);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(createdUids.splice(0).map((uid) => adminAuth.deleteUser(uid).catch(() => undefined)));
});

describe('POST /api/admin/orders/[orderId]/refund', () => {
  it('401s without a session cookie', async () => {
    const orderId = await seedOrder({ businessId: BUSINESS_ID, status: 'refund_requested' });
    const response = await refundRoute(refundRequest(orderId), { params: Promise.resolve({ orderId }) });
    expect(response.status).toBe(401);
  });

  it('404s an order that belongs to a different business', async () => {
    const cookie = await staffSessionCookie();
    const orderId = await seedOrder({ businessId: 'some-other-biz', status: 'refund_requested' });
    const response = await refundRoute(refundRequest(orderId, cookie), { params: Promise.resolve({ orderId }) });
    expect(response.status).toBe(404);
  });

  it('400s an order not flagged refund_requested', async () => {
    const cookie = await staffSessionCookie();
    const orderId = await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed' });
    const response = await refundRoute(refundRequest(orderId, cookie), { params: Promise.resolve({ orderId }) });
    expect(response.status).toBe(400);
  });

  it('200s and initiates a real reversal for a refund-requested order', async () => {
    const cookie = await staffSessionCookie();
    const orderId = await seedOrder({ businessId: BUSINESS_ID, status: 'refund_requested' });
    stubReversalSuccess();

    const response = await refundRoute(refundRequest(orderId, cookie), { params: Promise.resolve({ orderId }) });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe('processing');

    const refundDocs = await adminFirestore.collection('refunds').where('orderId', '==', orderId).get();
    expect(refundDocs.size).toBe(1);
  });

  it('409s when a refund is already in progress for the order', async () => {
    const cookie = await staffSessionCookie();
    const orderId = await seedOrder({ businessId: BUSINESS_ID, status: 'refund_requested' });
    stubReversalSuccess();
    await refundRoute(refundRequest(orderId, cookie), { params: Promise.resolve({ orderId }) });

    const response = await refundRoute(refundRequest(orderId, cookie), { params: Promise.resolve({ orderId }) });
    expect(response.status).toBe(409);
  });
});
