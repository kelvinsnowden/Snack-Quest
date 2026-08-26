import { beforeEach, describe, expect, it, vi } from 'vitest';

// `vi.hoisted`, because `vi.mock` is lifted above ordinary consts and
// would otherwise reference this before it exists.
const { smsSend } = vi.hoisted(() => ({
  smsSend: vi.fn().mockResolvedValue({ providerMessageId: 'sms-1' }),
}));
vi.mock('@/lib/integrations/sms/textSmsGateway', () => ({
  textSmsGateway: { send: smsSend },
}));

import { adminFirestore } from '@/lib/firebase/admin';
import { conversationRepository } from '@/repositories/conversationRepository';
import { ConversationService } from '@/services/conversationService';
import { FakeWhatsAppGateway } from '../helpers/fakeWhatsAppGateway';

const BUSINESS_ID = 'snack-quest';
const PHONE = '254712345678';

/**
 * The channel itself (§ customer communications move to SMS).
 *
 * Every other test in this suite injects its own sink, which is the
 * right thing for testing *what* a customer is told — but it means
 * none of them would notice if the default went back to WhatsApp. This
 * one constructs the service the way production does, with no sink at
 * all, and checks where the message actually went.
 */
describe('the default customer channel', () => {
  beforeEach(async () => {
    smsSend.mockClear();
    await adminFirestore.recursiveDelete(adminFirestore.collection('conversations'));
  });

  it('sends a customer reply as a text, not a WhatsApp message', async () => {
    const whatsapp = new FakeWhatsAppGateway();
    // No second argument — exactly how the exported singleton is built.
    const service = new ConversationService(whatsapp);
    const conversationId = await conversationRepository.create({
      businessId: BUSINESS_ID,
      phoneNumber: PHONE,
    });

    await service.sendAgentReply(BUSINESS_ID, conversationId, 'Your box goes out today.');

    expect(smsSend).toHaveBeenCalledWith({
      businessId: BUSINESS_ID,
      to: PHONE,
      body: 'Your box goes out today.',
    });
    // The point of the change: nothing went to WhatsApp.
    expect(whatsapp.sent).toEqual([]);
  });

  /*
   * SMS bills per segment, and one em dash takes the whole message
   * from 160-character segments to 70. The conversation copy is full
   * of them, so the normalisation has to be on the real send path and
   * not merely available to it.
   */
  it('normalises typography that would double the segment count', async () => {
    const service = new ConversationService(new FakeWhatsAppGateway());
    const conversationId = await conversationRepository.create({
      businessId: BUSINESS_ID,
      phoneNumber: PHONE,
    });

    await service.sendAgentReply(BUSINESS_ID, conversationId, 'KES 2,800 — enter your PIN');

    expect(smsSend).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'KES 2,800 - enter your PIN' }),
    );
  });

  /*
   * The transcript is what Admin renders, and it must keep the message
   * as written rather than the billing-optimised rewrite.
   */
  it('keeps the original text in the transcript', async () => {
    const service = new ConversationService(new FakeWhatsAppGateway());
    const conversationId = await conversationRepository.create({
      businessId: BUSINESS_ID,
      phoneNumber: PHONE,
    });

    await service.sendAgentReply(BUSINESS_ID, conversationId, 'KES 2,800 — enter your PIN');

    const messages = await adminFirestore
      .collection('conversations')
      .doc(conversationId)
      .collection('messages')
      .get();
    expect(messages.docs.map((doc) => doc.data().body)).toContain('KES 2,800 — enter your PIN');
  });
});
