import 'server-only';

import { getWhatchimpConfig, getWhatchimpWebhookVerifyToken, type WhatchimpConfig } from './config';
import { withCircuitBreaker } from '../shared/withCircuitBreaker';
import type {
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

class WhatchimpGateway implements WhatsAppGateway {
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

    return {
      providerMessageId: message.id,
      fromPhone: message.from,
      toPhoneNumberId: phoneNumberId,
      text,
      selectedId,
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

export const whatchimpGateway: WhatsAppGateway = new WhatchimpGateway();
