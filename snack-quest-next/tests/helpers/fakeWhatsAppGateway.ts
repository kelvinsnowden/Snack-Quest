import type { WhatsAppGateway, WhatsAppSendResult } from '@/lib/integrations/types';

/** A real, full `WhatsAppGateway` fake — no network, records every `sendMessage` call — shared by any test that needs to prove the conversation engine never (or always) actually sends. */
export class FakeWhatsAppGateway implements WhatsAppGateway {
  sent: { businessId: string; phone: string; text: string }[] = [];
  private counter = 0;

  async sendMessage(input: { businessId: string; phone: string; text: string }): Promise<WhatsAppSendResult> {
    this.sent.push(input);
    this.counter += 1;
    return { providerMessageId: `fake-${this.counter}` };
  }
  async sendTemplate(): Promise<WhatsAppSendResult> {
    throw new Error('not used in this test');
  }
  async sendButtons(): Promise<WhatsAppSendResult> {
    throw new Error('not used in this test');
  }
  async sendList(): Promise<WhatsAppSendResult> {
    throw new Error('not used in this test');
  }
  async sendCatalogMessage(): Promise<WhatsAppSendResult> {
    throw new Error('not used in this test');
  }
  async markAsRead(): Promise<void> {}
  parseIncomingMessage(): never {
    throw new Error('not used in this test');
  }
  verifyWebhookChallenge(): string | null {
    return null;
  }
  async assignHumanAgent(): Promise<void> {}
  async updateConversationStatus(): Promise<void> {}
}
