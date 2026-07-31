import 'server-only';

import { whatchimpGateway } from '@/lib/integrations/whatchimp/whatchimpGateway';
import type { WhatsAppGateway } from '@/lib/integrations/types';

/**
 * Minimal by design (PLATFORM_ARCHITECTURE_V2.md §10): the one real
 * thing a completed order needs today is the business owner knowing
 * it happened. Templates, multi-channel routing, and `outboundMessages`
 * persistence are real Messaging Domain scope, but nothing a customer's
 * purchase today depends on — not built until a feature needs them.
 *
 * Takes a `WhatsAppGateway` via constructor injection, same as
 * `ConversationService` — so admin notifications and customer
 * notifications always go through the same gateway instance, not two
 * independently-configured ones.
 */
class NotificationService {
  constructor(private readonly gateway: WhatsAppGateway = whatchimpGateway) {}

  async notifyAdmin(text: string): Promise<void> {
    const adminPhone = process.env.ADMIN_WHATSAPP_PHONE;
    if (!adminPhone) {
      // No admin number configured yet — don't fail the order over it.
      return;
    }
    await this.gateway.sendMessage({ phone: adminPhone, text });
  }
}

export const notificationService = new NotificationService();
export { NotificationService };
