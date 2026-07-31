import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminAuth, adminFirestore } from '@/lib/firebase/admin';
import { businessRepository } from '@/repositories/businessRepository';
import { userRepository } from '@/repositories/userRepository';
import { staffRepository } from '@/repositories/staffRepository';
import { staffAuthService } from '@/services/staffAuthService';
import { STAFF_SESSION_COOKIE } from '@/lib/auth/cookieName';
import { POST as statusRoute } from '@/app/api/admin/orders/[orderId]/status/route';
import { getIdTokenForUid } from '../helpers/authEmulator';
import { seedOrder } from '../helpers/orderFixtures';

/**
 * The Admin Orders status-change wire (§ Admin: Orders) end to end
 * against the emulator: a real staff session cookie, a real order
 * document, real transition enforcement — proving the route maps
 * `OrderService`'s errors to the right HTTP status rather than
 * assuming it from reading the code.
 */

const BUSINESS_ID = 'biz-admin-order-status-route-test';
const createdUids: string[] = [];

async function cleanCollections() {
  for (const name of ['businesses', 'users', 'staffProfiles', 'orders', 'domainEvents']) {
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

function statusRequest(orderId: string, body: unknown, cookie?: string): Request {
  return new Request(`http://localhost/api/admin/orders/${orderId}/status`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie: `${STAFF_SESSION_COOKIE}=${cookie}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  await cleanCollections();
  await businessRepository.create(
    BUSINESS_ID,
    {
      name: 'Admin Order Status Route Test Biz',
      currency: 'KES',
      whatsappPhoneNumberId: 'wa-admin-order-status-route-test',
      countyCoverage: [],
      adminWhatsappPhone: null,
      status: 'active',
    },
    'system',
  );
});

afterEach(async () => {
  await Promise.all(createdUids.splice(0).map((uid) => adminAuth.deleteUser(uid).catch(() => undefined)));
});

describe('POST /api/admin/orders/[orderId]/status', () => {
  it('401s without a session cookie', async () => {
    const orderId = await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed' });
    const response = await statusRoute(statusRequest(orderId, { status: 'dispatched' }), {
      params: Promise.resolve({ orderId }),
    });
    expect(response.status).toBe(401);
  });

  it('400s an unrecognized status value', async () => {
    const cookie = await staffSessionCookie();
    const orderId = await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed' });
    const response = await statusRoute(statusRequest(orderId, { status: 'not-a-real-status' }, cookie), {
      params: Promise.resolve({ orderId }),
    });
    expect(response.status).toBe(400);
  });

  it('404s an order that belongs to a different business', async () => {
    const cookie = await staffSessionCookie();
    const orderId = await seedOrder({ businessId: 'some-other-biz', status: 'confirmed' });
    const response = await statusRoute(statusRequest(orderId, { status: 'dispatched' }, cookie), {
      params: Promise.resolve({ orderId }),
    });
    expect(response.status).toBe(404);
  });

  it('409s an illegal transition', async () => {
    const cookie = await staffSessionCookie();
    const orderId = await seedOrder({ businessId: BUSINESS_ID, status: 'delivered' });
    const response = await statusRoute(statusRequest(orderId, { status: 'confirmed' }, cookie), {
      params: Promise.resolve({ orderId }),
    });
    expect(response.status).toBe(409);
  });

  it('200s a legal transition and persists the reason', async () => {
    const cookie = await staffSessionCookie();
    const orderId = await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed' });

    const response = await statusRoute(
      statusRequest(orderId, { status: 'cancelled', reason: 'Customer changed their mind' }, cookie),
      { params: Promise.resolve({ orderId }) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { order: { status: string } };
    expect(body.order.status).toBe('cancelled');

    const doc = await adminFirestore.collection('orders').doc(orderId).get();
    expect(doc.data()?.status).toBe('cancelled');
    expect(doc.data()?.statusReason).toBe('Customer changed their mind');
  });
});
