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

  /**
   * Also a `ConversationOutputSink`, so one fake can stand in for both
   * halves of what `ConversationService` sends.
   *
   * Customer-facing replies no longer go through `sendMessage` at all
   * — they are texts now (§ customer communications move to SMS) — but
   * the BSP inbox calls still go through this gateway. Recording both
   * into the same `sent` array keeps every existing assertion about
   * what a customer was told meaningful, and keeps the tests about the
   * message rather than about the transport.
   */
  async send(input: { businessId: string; phone: string; text: string }): Promise<WhatsAppSendResult> {
    return this.sendMessage(input);
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
