import { describe, expect, it, vi } from 'vitest';

const { adminAssignAgentMock, adminReturnToBotMock, sendAgentReplyMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  adminAssignAgentMock: vi.fn(),
  adminReturnToBotMock: vi.fn(),
  sendAgentReplyMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/conversationService', () => ({
  conversationService: {
    adminAssignAgent: adminAssignAgentMock,
    adminReturnToBot: adminReturnToBotMock,
    sendAgentReply: sendAgentReplyMock,
  },
  ConversationNotFoundError: class ConversationNotFoundError extends Error {},
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

import { POST as assignRoute } from '@/app/api/admin/conversations/[conversationId]/assign/route';
import { POST as returnToBotRoute } from '@/app/api/admin/conversations/[conversationId]/return-to-bot/route';
import { POST as replyRoute } from '@/app/api/admin/conversations/[conversationId]/reply/route';
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
