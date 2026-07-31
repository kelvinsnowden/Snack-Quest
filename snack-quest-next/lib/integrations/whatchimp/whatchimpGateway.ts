import 'server-only';

import {
  CatalogNotConfiguredError,
  getWhatchimpConfig,
  getWhatchimpWebhookVerifyToken,
  type WhatchimpConfig,
} from './config';
import { withCircuitBreaker } from '../shared/withCircuitBreaker';
import type {
  ProductCatalogGateway,
  ProductCatalogItem,
  WhatsAppGateway,
  WhatsAppInboundMessage,
  WhatsAppSendResult,
} from '../types';

const GATEWAY_NAME = 'whatchimp';

interface RawIncomingWebhook {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: Array<{
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          button?: { text: string };
          interactive?: {
            type: string;
            button_reply?: { id: string; title: string };
            list_reply?: { id: string; title: string };
          };
          // The real WhatsApp Cloud API "order" message — how a
          // customer's Product Catalog cart arrives ("Receive Order").
          order?: {
            catalog_id: string;
            text?: string;
            product_items?: Array<{
              product_retailer_id: string;
              quantity: number;
              item_price?: number;
            }>;
          };
        }>;
      };
    }>;
  }>;
}

async function postMessage(
  businessId: string,
  config: WhatchimpConfig,
  body: Record<string, unknown>,
): Promise<WhatsAppSendResult> {
  // Deliberately NOT wrapped in withRetry: a blind retry of a send
  // after an ambiguous network failure risks a duplicate message
  // landing in the customer's WhatsApp thread — the same reasoning
  // DarajaGateway applies to STK push initiation. A caller-level retry
  // decision belongs to NotificationService/ConversationService, which
  // have conversation state to reason about whether the first attempt
  // actually reached Whatchimp.
  return withCircuitBreaker(`${GATEWAY_NAME}:${businessId}`, async () => {
    const response = await fetch(
      `${config.baseUrl}/${config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
      },
    );

    const data = (await response.json()) as {
      messages?: Array<{ id: string }>;
      error?: { message?: string };
    };
    if (!response.ok || !data.messages?.[0]?.id) {
      throw new Error(
        `Whatchimp send failed: ${data.error?.message ?? response.status}`,
      );
    }
    return { providerMessageId: data.messages[0].id };
  });
}

/**
 * `syncItem`/`removeItem` (§ product catalog sync) are modeled on
 * Meta's real, public WhatsApp Commerce Catalog Batch API
 * (`POST /{catalog_id}/items_batch`), proxied through Whatchimp's own
 * `baseUrl` — the same convention every other method here already
 * uses. This is a deliberate, disclosed choice, not a verified fact
 * about Whatchimp specifically: no independently checkable Whatchimp
 * API documentation exists anywhere (see `metaConversionGateway.ts`'s
 * own comment contrasting Meta's "well-documented" API against
 * Whatchimp's), and the rest of this Gateway is already a faithful
 * mirror of the real Meta Cloud API wire format — so modeling the
 * catalog piece on Meta's real Catalog API is the closest honest
 * approximation available, not a guess invented from nothing.
 */
class WhatchimpGateway implements WhatsAppGateway, ProductCatalogGateway {
  async sendMessage(input: {
    businessId: string;
    phone: string;
    text: string;
  }): Promise<WhatsAppSendResult> {
    const config = await getWhatchimpConfig(input.businessId);
    return postMessage(input.businessId, config, {
      to: input.phone,
      type: 'text',
      text: { body: input.text },
    });
  }

  async sendTemplate(input: {
    businessId: string;
    phone: string;
    templateCode: string;
    params: Record<string, string>;
  }): Promise<WhatsAppSendResult> {
    const config = await getWhatchimpConfig(input.businessId);
    return postMessage(input.businessId, config, {
      to: input.phone,
      type: 'template',
      template: {
        name: input.templateCode,
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: Object.values(input.params).map((text) => ({
              type: 'text',
              text,
            })),
          },
        ],
      },
    });
  }

  async sendButtons(input: {
    businessId: string;
    phone: string;
    bodyText: string;
    buttons: { id: string; title: string }[];
  }): Promise<WhatsAppSendResult> {
    const config = await getWhatchimpConfig(input.businessId);
    return postMessage(input.businessId, config, {
      to: input.phone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: input.bodyText },
        action: {
          buttons: input.buttons.map((button) => ({
            type: 'reply',
            reply: { id: button.id, title: button.title },
          })),
        },
      },
    });
  }

  async sendList(input: {
    businessId: string;
    phone: string;
    bodyText: string;
    buttonLabel: string;
    sections: { title: string; rows: { id: string; title: string; description?: string }[] }[];
  }): Promise<WhatsAppSendResult> {
    const config = await getWhatchimpConfig(input.businessId);
    return postMessage(input.businessId, config, {
      to: input.phone,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: input.bodyText },
        action: { button: input.buttonLabel, sections: input.sections },
      },
    });
  }

  /**
   * "Send Catalog Messages" — modeled on the real Meta interactive
   * `product_list` message (works for one product or several; there's
   * no reason to special-case a single-product `interactive.type:
   * 'product'` variant when `product_list` covers both).
   */
  async sendCatalogMessage(input: {
    businessId: string;
    phone: string;
    catalogId: string;
    productRetailerIds: string[];
    bodyText?: string;
  }): Promise<WhatsAppSendResult> {
    const config = await getWhatchimpConfig(input.businessId);
    return postMessage(input.businessId, config, {
      to: input.phone,
      type: 'interactive',
      interactive: {
        type: 'product_list',
        header: { type: 'text', text: 'Snack Quest' },
        body: { text: input.bodyText ?? 'Take a look at these Snack Quest boxes:' },
        action: {
          catalog_id: input.catalogId,
          sections: [
            {
              title: 'Snack Boxes',
              product_items: input.productRetailerIds.map((id) => ({
                product_retailer_id: id,
              })),
            },
          ],
        },
      },
    });
  }

  async markAsRead(businessId: string, providerMessageId: string): Promise<void> {
    const config = await getWhatchimpConfig(businessId);
    await withCircuitBreaker(`${GATEWAY_NAME}:${businessId}`, async () => {
      const response = await fetch(
        `${config.baseUrl}/${config.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: providerMessageId,
          }),
        },
      );
      if (!response.ok) {
        throw new Error(`Whatchimp markAsRead failed: ${response.status}`);
      }
    });
  }

  /**
   * `POST {baseUrl}/{catalogId}/items_batch` — the real, publicly
   * documented Meta WhatsApp Commerce Catalog Batch API shape,
   * proxied through Whatchimp's own base URL the same way every other
   * method in this Gateway is (see the class-level note below on why
   * this is the honest choice here, absent real Whatchimp docs).
   */
  async syncItem(businessId: string, item: ProductCatalogItem): Promise<void> {
    const config = await getWhatchimpConfig(businessId);
    if (!config.catalogId) {
      throw new CatalogNotConfiguredError(businessId);
    }
    await withCircuitBreaker(`${GATEWAY_NAME}:${businessId}`, async () => {
      const response = await fetch(`${config.baseUrl}/${config.catalogId}/items_batch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              method: 'UPDATE',
              data: {
                id: item.retailerId,
                name: item.name,
                description: item.description,
                availability: item.availability,
                condition: 'new',
                price: `${item.priceKes} KES`,
                currency: 'KES',
                // No public product-detail page exists in this
                // WhatsApp-only storefront — omitted rather than
                // pointed at a fabricated URL. `image_link` only sent
                // once a real Vercel Blob upload exists.
                ...(item.imageUrl ? { image_link: item.imageUrl } : {}),
              },
            },
          ],
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(
          `Whatchimp catalog sync failed for ${item.retailerId}: ${data.error?.message ?? response.status}`,
        );
      }
    });
  }

  async removeItem(businessId: string, retailerId: string): Promise<void> {
    const config = await getWhatchimpConfig(businessId);
    if (!config.catalogId) {
      throw new CatalogNotConfiguredError(businessId);
    }
    await withCircuitBreaker(`${GATEWAY_NAME}:${businessId}`, async () => {
      const response = await fetch(`${config.baseUrl}/${config.catalogId}/items_batch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [{ method: 'DELETE', data: { id: retailerId } }],
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(
          `Whatchimp catalog item removal failed for ${retailerId}: ${data.error?.message ?? response.status}`,
        );
      }
    });
  }

  /**
   * "Assign Human Agent" / "Update Conversation" — unlike every other
   * method in this Gateway, these have no real Meta Cloud API analog
   * to model against: agent handoff and conversation/contact status
   * are BSP-layer inbox features (real examples: 360dialog's and
   * Respond.io's conversation-tagging APIs), not part of the raw
   * WhatsApp messaging API. With no real Whatchimp documentation
   * either, this is a plausible REST shape following this Gateway's
   * own existing base-URL convention — genuinely unverified, and
   * every caller in this codebase treats both as best-effort for
   * exactly that reason: Snack Quest OS's own Firestore state is the
   * real source of truth regardless of whether this call succeeds.
   */
  async assignHumanAgent(input: {
    businessId: string;
    phone: string;
    reason: string;
  }): Promise<void> {
    const config = await getWhatchimpConfig(input.businessId);
    await withCircuitBreaker(`${GATEWAY_NAME}:${input.businessId}`, async () => {
      const response = await fetch(
        `${config.baseUrl}/${config.phoneNumberId}/conversations/${input.phone}/assign`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason: input.reason }),
        },
      );
      if (!response.ok) {
        throw new Error(`Whatchimp assignHumanAgent failed: ${response.status}`);
      }
    });
  }

  async updateConversationStatus(input: {
    businessId: string;
    phone: string;
    status: string;
  }): Promise<void> {
    const config = await getWhatchimpConfig(input.businessId);
    await withCircuitBreaker(`${GATEWAY_NAME}:${input.businessId}`, async () => {
      const response = await fetch(
        `${config.baseUrl}/${config.phoneNumberId}/conversations/${input.phone}/status`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: input.status }),
        },
      );
      if (!response.ok) {
        throw new Error(`Whatchimp updateConversationStatus failed: ${response.status}`);
      }
    });
  }

  parseIncomingMessage(payload: unknown): WhatsAppInboundMessage {
    const value = (payload as RawIncomingWebhook).entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    const phoneNumberId = value?.metadata?.phone_number_id;
    if (!message || !phoneNumberId) {
      throw new Error(
        'Malformed Whatchimp webhook payload: missing entry[0].changes[0].value.messages[0] or .metadata.phone_number_id',
      );
    }

    const selectedId =
      message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id;
    const text =
      message.text?.body ??
      message.button?.text ??
      message.interactive?.button_reply?.title ??
      message.interactive?.list_reply?.title ??
      '';

    // "Receive Order" — the structured Product Catalog cart signal,
    // preferred over parsing free text whenever it's present.
    const catalogOrder = message.order
      ? {
          catalogId: message.order.catalog_id,
          items: (message.order.product_items ?? []).map((item) => ({
            productRetailerId: item.product_retailer_id,
            quantity: item.quantity,
            itemPriceKes: item.item_price,
          })),
          text: message.order.text,
        }
      : undefined;

    return {
      providerMessageId: message.id,
      fromPhone: message.from,
      toPhoneNumberId: phoneNumberId,
      text,
      selectedId,
      catalogOrder,
      receivedAt: new Date(Number(message.timestamp) * 1000).toISOString(),
    };
  }

  verifyWebhookChallenge(query: {
    mode?: string;
    token?: string;
    challenge?: string;
  }): string | null {
    const verifyToken = getWhatchimpWebhookVerifyToken();
    if (query.mode === 'subscribe' && query.token === verifyToken) {
      return query.challenge ?? null;
    }
    return null;
  }
}

export const whatchimpGateway: WhatsAppGateway & ProductCatalogGateway = new WhatchimpGateway();
