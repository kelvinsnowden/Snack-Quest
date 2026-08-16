import { describe, expect, it, vi } from 'vitest';

const { adminAssignAgentMock, adminReturnToBotMock, sendAgentReplyMock, adminPriceDoorDeliveryMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  adminAssignAgentMock: vi.fn(),
  adminReturnToBotMock: vi.fn(),
  sendAgentReplyMock: vi.fn(),
  adminPriceDoorDeliveryMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/conversationService', () => ({
  conversationService: {
    adminAssignAgent: adminAssignAgentMock,
    adminReturnToBot: adminReturnToBotMock,
    sendAgentReply: sendAgentReplyMock,
    adminPriceDoorDelivery: adminPriceDoorDeliveryMock,
  },
  ConversationNotFoundError: class ConversationNotFoundError extends Error {},
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/lib/audit/recordAuditLog', () => ({
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import { POST as assignRoute } from '@/app/api/admin/conversations/[conversationId]/assign/route';
import { POST as returnToBotRoute } from '@/app/api/admin/conversations/[conversationId]/return-to-bot/route';
import { POST as replyRoute } from '@/app/api/admin/conversations/[conversationId]/reply/route';
import { POST as priceDoorDeliveryRoute } from '@/app/api/admin/conversations/[conversationId]/price-door-delivery/route';
import { ConversationNotFoundError } from '@/services/conversationService';

/**
 * Route-handler-level tests for the Admin Conversation monitoring
 * endpoints (§ Admin: Conversation monitoring) — `ConversationService`
 * itself is already covered by tests/services/conversationServiceAdmin.test.ts;
 * these prove the wire.
 */

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

function request(url: string, body?: unknown): Request {
  return new Request(url, {
    method: 'POST',
    ...(body !== undefined
      ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });
}

describe('POST /api/admin/conversations/[conversationId]/assign', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await assignRoute(request('http://localhost/api/admin/conversations/c1/assign'), {
      params: Promise.resolve({ conversationId: 'c1' }),
    });
    expect(response.status).toBe(401);
    expect(adminAssignAgentMock).not.toHaveBeenCalled();
  });

  it('assigns the calling staff member, scoped to the session businessId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    adminAssignAgentMock.mockResolvedValue(undefined);

    const response = await assignRoute(request('http://localhost/api/admin/conversations/c1/assign'), {
      params: Promise.resolve({ conversationId: 'c1' }),
    });

    expect(response.status).toBe(200);
    expect(adminAssignAgentMock).toHaveBeenCalledWith('biz-1', 'c1', 'staff-1');
  });

  it('allows the agent role — this is the Agent workspace’s own core action (§ security audit)', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue({ ...STAFF_SESSION, roles: ['agent'] });
    adminAssignAgentMock.mockResolvedValue(undefined);

    const response = await assignRoute(request('http://localhost/api/admin/conversations/c1/assign'), {
      params: Promise.resolve({ conversationId: 'c1' }),
    });

    expect(response.status).toBe(200);
  });

  it('403s a valid session that only holds the finance role', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue({ ...STAFF_SESSION, roles: ['finance'] });
    const response = await assignRoute(request('http://localhost/api/admin/conversations/c1/assign'), {
      params: Promise.resolve({ conversationId: 'c1' }),
    });
    expect(response.status).toBe(403);
  });

  it('404s a conversation the service reports as not found', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    adminAssignAgentMock.mockRejectedValue(new ConversationNotFoundError('c1'));

    const response = await assignRoute(request('http://localhost/api/admin/conversations/c1/assign'), {
      params: Promise.resolve({ conversationId: 'c1' }),
    });
    expect(response.status).toBe(404);
  });
});

describe('POST /api/admin/conversations/[conversationId]/return-to-bot', () => {
  it('200s and calls the service scoped to the session businessId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    adminReturnToBotMock.mockResolvedValue(undefined);

    const response = await returnToBotRoute(request('http://localhost/api/admin/conversations/c1/return-to-bot'), {
      params: Promise.resolve({ conversationId: 'c1' }),
    });

    expect(response.status).toBe(200);
    expect(adminReturnToBotMock).toHaveBeenCalledWith('biz-1', 'c1');
  });
});

describe('POST /api/admin/conversations/[conversationId]/reply', () => {
  it('400s a missing text', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await replyRoute(request('http://localhost/api/admin/conversations/c1/reply', {}), {
      params: Promise.resolve({ conversationId: 'c1' }),
    });
    expect(response.status).toBe(400);
  });

  it('200s and forwards the trimmed text, scoped to the session businessId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    sendAgentReplyMock.mockResolvedValue(undefined);

    const response = await replyRoute(request('http://localhost/api/admin/conversations/c1/reply', { text: '  Hi there  ' }), {
      params: Promise.resolve({ conversationId: 'c1' }),
    });

    expect(response.status).toBe(200);
    expect(sendAgentReplyMock).toHaveBeenCalledWith('biz-1', 'c1', 'Hi there');
  });
});

describe('POST /api/admin/conversations/[conversationId]/price-door-delivery', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await priceDoorDeliveryRoute(
      request('http://localhost/api/admin/conversations/c1/price-door-delivery', { feeKes: 350 }),
      { params: Promise.resolve({ conversationId: 'c1' }) },
    );
    expect(response.status).toBe(401);
    expect(adminPriceDoorDeliveryMock).not.toHaveBeenCalled();
  });

  it('400s a missing/invalid feeKes', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await priceDoorDeliveryRoute(
      request('http://localhost/api/admin/conversations/c1/price-door-delivery', { feeKes: -5 }),
      { params: Promise.resolve({ conversationId: 'c1' }) },
    );
    expect(response.status).toBe(400);
    expect(adminPriceDoorDeliveryMock).not.toHaveBeenCalled();
  });

  it('200s and prices using the calling staff member as the agent, scoped to the session businessId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    adminPriceDoorDeliveryMock.mockResolvedValue(undefined);

    const response = await priceDoorDeliveryRoute(
      request('http://localhost/api/admin/conversations/c1/price-door-delivery', { feeKes: 350 }),
      { params: Promise.resolve({ conversationId: 'c1' }) },
    );

    expect(response.status).toBe(200);
    expect(adminPriceDoorDeliveryMock).toHaveBeenCalledWith('biz-1', 'c1', { agentId: 'staff-1', feeKes: 350 });
  });

  it('404s a conversation the service reports as not found', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    adminPriceDoorDeliveryMock.mockRejectedValue(new ConversationNotFoundError('c1'));

    const response = await priceDoorDeliveryRoute(
      request('http://localhost/api/admin/conversations/c1/price-door-delivery', { feeKes: 350 }),
      { params: Promise.resolve({ conversationId: 'c1' }) },
    );
    expect(response.status).toBe(404);
  });

  it('400s a state error from the service', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    adminPriceDoorDeliveryMock.mockRejectedValue(new Error('Conversation c1 is not awaiting agent pricing (status: active)'));

    const response = await priceDoorDeliveryRoute(
      request('http://localhost/api/admin/conversations/c1/price-door-delivery', { feeKes: 350 }),
      { params: Promise.resolve({ conversationId: 'c1' }) },
    );
    expect(response.status).toBe(400);
  });
});
