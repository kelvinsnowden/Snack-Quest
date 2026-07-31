import 'server-only';

import { whatchimpGateway } from '@/lib/integrations/whatchimp/whatchimpGateway';
import { businessRepository } from '@/repositories/businessRepository';
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
 * independently-configured ones. The admin phone number itself is
 * per-business config (`businesses/{businessId}.adminWhatsappPhone`),
 * never a global env var — a second tenant's admin alerts must never
 * have any chance of going to the first tenant's number.
 */
class NotificationService {
  constructor(private readonly gateway: WhatsAppGateway = whatchimpGateway) {}

  async notifyAdmin(businessId: string, text: string): Promise<void> {
    const business = await businessRepository.findById(businessId);
    if (!business?.adminWhatsappPhone) {
      // No admin number configured for this tenant — don't fail the order over it.
      return;
    }
    await this.gateway.sendMessage({ businessId, phone: business.adminWhatsappPhone, text });
  }
}

export const notificationService = new NotificationService();
export { NotificationService };
