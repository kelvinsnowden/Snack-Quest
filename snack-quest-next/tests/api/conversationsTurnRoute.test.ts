import { beforeEach, describe, expect, it, vi } from 'vitest';

const { processConversationTurnMock } = vi.hoisted(() => ({
  processConversationTurnMock: vi.fn(),
}));

vi.mock('@/services/conversationTurnService', () => ({
  processConversationTurn: processConversationTurnMock,
}));

import { POST as turnRoute } from '@/app/api/conversations/turn/route';

const API_KEY = 'test-turn-secret';

function call(body: unknown, apiKey: string | null = API_KEY): Promise<Response> {
  return turnRoute(
    new Request('http://localhost/api/conversations/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(apiKey ? { 'x-checkout-api-key': apiKey } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WHATCHIMP_CHECKOUT_API_KEY = API_KEY;
});

describe('POST /api/conversations/turn', () => {
  it('401s without a valid shared secret', async () => {
    const response = await call({ businessId: 'biz-1', channel: 'whatsapp', externalUserId: '254700000000', text: 'hi' }, 'wrong');
    expect(response.status).toBe(401);
    expect(processConversationTurnMock).not.toHaveBeenCalled();
  });

  it('400s a missing businessId', async () => {
    const response = await call({ channel: 'whatsapp', externalUserId: '254700000000', text: 'hi' });
    expect(response.status).toBe(400);
  });

  it('400s an unrecognized channel', async () => {
    const response = await call({ businessId: 'biz-1', channel: 'sms', externalUserId: '254700000000', text: 'hi' });
    expect(response.status).toBe(400);
  });

  it('400s an empty text', async () => {
    const response = await call({ businessId: 'biz-1', channel: 'whatsapp', externalUserId: '254700000000', text: '' });
    expect(response.status).toBe(400);
  });

  it('200s the happy path, forwarding a null providerMessageId when omitted', async () => {
    processConversationTurnMock.mockResolvedValue({
      conversationId: 'conv-1',
      nextStep: 'awaiting_package_selection',
      messages: ['Welcome to Snack Quest!'],
      messageText: 'Welcome to Snack Quest!',
    });

    const response = await call({ businessId: 'biz-1', channel: 'whatsapp', externalUserId: '254700000000', text: 'hi' });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.conversationId).toBe('conv-1');
    expect(processConversationTurnMock).toHaveBeenCalledWith({
      businessId: 'biz-1',
      channel: 'whatsapp',
      externalUserId: '254700000000',
      text: 'hi',
      providerMessageId: null,
    });
  });

  it('400s when the engine throws', async () => {
    processConversationTurnMock.mockRejectedValue(new Error('boom'));
    const response = await call({ businessId: 'biz-1', channel: 'whatsapp', externalUserId: '254700000000', text: 'hi' });
    expect(response.status).toBe(400);
  });
});
