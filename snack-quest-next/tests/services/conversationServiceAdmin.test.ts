import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { conversationRepository } from '@/repositories/conversationRepository';
import { ConversationService, ConversationNotFoundError } from '@/services/conversationService';
import type { WhatsAppGateway } from '@/lib/integrations/types';

/**
 * `ConversationService`'s admin methods (§ Admin: Conversation
 * monitoring) — tenant scoping, assign/return, and the agent-reply
 * wire (a real `WhatsAppGateway.sendMessage` call plus a transcript
 * append), against the real emulator. The bot's own turn-by-turn
 * logic is exercised via tests/integration/conversationJourney.test.ts.
 */

const BUSINESS_ID = 'biz-conversation-service-admin-test';
const OTHER_BUSINESS_ID = 'biz-conversation-service-admin-other';

function mockGateway(): WhatsAppGateway {
  return {
    sendMessage: vi.fn().mockResolvedValue({ providerMessageId: 'msg-1' }),
    sendTemplate: vi.fn(),
    sendButtons: vi.fn(),
    sendList: vi.fn(),
    sendCatalogMessage: vi.fn(),
    markAsRead: vi.fn(),
    parseIncomingMessage: vi.fn(),
    verifyWebhookChallenge: vi.fn(),
    assignHumanAgent: vi.fn(),
    updateConversationStatus: vi.fn(),
  } as unknown as WhatsAppGateway;
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('conversations'));
});

describe('ConversationService.getConversation', () => {
  it('throws ConversationNotFoundError for a conversation in a different business', async () => {
    const service = new ConversationService(mockGateway());
    const id = await conversationRepository.create({ businessId: OTHER_BUSINESS_ID, phoneNumber: '254700000001' });

    await expect(service.getConversation(BUSINESS_ID, id)).rejects.toBeInstanceOf(ConversationNotFoundError);
  });

  it('throws ConversationNotFoundError for an unknown id', async () => {
    const service = new ConversationService(mockGateway());
    await expect(service.getConversation(BUSINESS_ID, 'does-not-exist')).rejects.toBeInstanceOf(ConversationNotFoundError);
  });
});

describe('ConversationService.adminAssignAgent / adminReturnToBot', () => {
  it('assigns and then returns to the bot', async () => {
    const service = new ConversationService(mockGateway());
    const id = await conversationRepository.create({ businessId: BUSINESS_ID, phoneNumber: '254700000002' });

    await service.adminAssignAgent(BUSINESS_ID, id, 'staff-1');
    let conversation = await conversationRepository.findById(id);
    expect(conversation?.status).toBe('agent_assigned');
    expect(conversation?.assignedAgentId).toBe('staff-1');

    await service.adminReturnToBot(BUSINESS_ID, id);
    conversation = await conversationRepository.findById(id);
    expect(conversation?.status).toBe('active');
    expect(conversation?.assignedAgentId).toBeNull();
  });

  it('rejects a conversation outside the business', async () => {
    const service = new ConversationService(mockGateway());
    const id = await conversationRepository.create({ businessId: OTHER_BUSINESS_ID, phoneNumber: '254700000003' });

    await expect(service.adminAssignAgent(BUSINESS_ID, id, 'staff-1')).rejects.toBeInstanceOf(ConversationNotFoundError);
  });
});

describe('ConversationService.sendAgentReply', () => {
  it('sends through the gateway and appends the message to the transcript', async () => {
    const gateway = mockGateway();
    const service = new ConversationService(gateway);
    const id = await conversationRepository.create({ businessId: BUSINESS_ID, phoneNumber: '254700000004' });

    await service.sendAgentReply(BUSINESS_ID, id, 'Hi! An agent is here to help.');

    expect(gateway.sendMessage).toHaveBeenCalledWith({
      businessId: BUSINESS_ID,
      phone: '254700000004',
      text: 'Hi! An agent is here to help.',
    });
    const messages = await conversationRepository.listMessages(id);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ direction: 'outbound', body: 'Hi! An agent is here to help.' });
  });

  it('rejects a conversation outside the business without calling the gateway', async () => {
    const gateway = mockGateway();
    const service = new ConversationService(gateway);
    const id = await conversationRepository.create({ businessId: OTHER_BUSINESS_ID, phoneNumber: '254700000005' });

    await expect(service.sendAgentReply(BUSINESS_ID, id, 'hi')).rejects.toBeInstanceOf(ConversationNotFoundError);
    expect(gateway.sendMessage).not.toHaveBeenCalled();
  });
});
