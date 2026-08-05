import { beforeEach, describe, expect, it, vi } from 'vitest';

const { processConversationTurnMock, findByWhatsappPhoneNumberIdMock } = vi.hoisted(() => ({
  processConversationTurnMock: vi.fn(),
  findByWhatsappPhoneNumberIdMock: vi.fn(),
}));

vi.mock('@/services/conversationTurnService', () => ({
  processConversationTurn: processConversationTurnMock,
}));

vi.mock('@/repositories/businessRepository', () => ({
  businessRepository: { findByWhatsappPhoneNumberId: findByWhatsappPhoneNumberIdMock },
}));

import { POST as whatchimpTurnRoute } from '@/app/api/whatchimp/turn/route';

const API_KEY = 'test-turn-secret';

function call(body: unknown, apiKey: string | null = API_KEY): Promise<Response> {
  return whatchimpTurnRoute(
    new Request('http://localhost/api/whatchimp/turn', {
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

describe('POST /api/whatchimp/turn', () => {
  it('401s without a valid shared secret', async () => {
    const response = await call({ phoneNumberId: 'wa-1', customerPhone: '254700000000', text: 'hi' }, 'wrong');
    expect(response.status).toBe(401);
    expect(findByWhatsappPhoneNumberIdMock).not.toHaveBeenCalled();
  });

  it('400s a missing text', async () => {
    const response = await call({ phoneNumberId: 'wa-1', customerPhone: '254700000000' });
    expect(response.status).toBe(400);
  });

  it('404s when no business owns the WhatsApp number', async () => {
    findByWhatsappPhoneNumberIdMock.mockResolvedValue(null);
    const response = await call({ phoneNumberId: 'wa-unknown', customerPhone: '254700000000', text: 'hi' });
    expect(response.status).toBe(404);
    expect(processConversationTurnMock).not.toHaveBeenCalled();
  });

  it('resolves phoneNumberId to businessId and forwards a whatsapp-channel turn', async () => {
    findByWhatsappPhoneNumberIdMock.mockResolvedValue({ id: 'biz-1', data: {} });
    processConversationTurnMock.mockResolvedValue({
      conversationId: 'conv-1',
      nextStep: 'awaiting_package_selection',
      messages: ['Welcome to Snack Quest!'],
      messageText: 'Welcome to Snack Quest!',
    });

    const response = await call({ phoneNumberId: 'wa-1', customerPhone: '254700000000', text: 'hi' });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.messageText).toBe('Welcome to Snack Quest!');
    expect(processConversationTurnMock).toHaveBeenCalledWith({
      businessId: 'biz-1',
      channel: 'whatsapp',
      externalUserId: '254700000000',
      text: 'hi',
      providerMessageId: null,
    });
  });

  it('400s when the engine throws', async () => {
    findByWhatsappPhoneNumberIdMock.mockResolvedValue({ id: 'biz-1', data: {} });
    processConversationTurnMock.mockRejectedValue(new Error('boom'));
    const response = await call({ phoneNumberId: 'wa-1', customerPhone: '254700000000', text: 'hi' });
    expect(response.status).toBe(400);
  });
});
