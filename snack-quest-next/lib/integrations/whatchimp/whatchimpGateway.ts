import 'server-only';

import {
  getWhatchimpConfig,
  getWhatchimpWebhookVerifyToken,
  WhatchimpCapabilityNotSupportedError,
  type WhatchimpConfig,
} from './config';
import { withCircuitBreaker } from '../shared/withCircuitBreaker';
import type {
  ProductCatalogGateway,
  WhatsAppGateway,
  WhatsAppInboundMessage,
  WhatsAppSendResult,
} from '../types';

const GATEWAY_NAME = 'whatchimp';

/**
 * WhatChimp reports logical success as `"1"` (a string) on the WhatsApp
 * endpoints but `true` (a boolean) on at least the catalog ones — and
 * it returns HTTP 200 for logical failures, with `status: "0"` and a
 * human-readable `message`. So neither `response.ok` nor a strict
 * `=== '1'` is sufficient on its own; both are checked.
 */
function isOkStatus(status: unknown): boolean {
  return status === '1' || status === 1 || status === true;
}

interface WhatchimpResponse {
  status?: unknown;
  message?: unknown;
  wa_message_id?: string;
}

/**
 * Every WhatChimp endpoint is `POST` with an
 * `application/x-www-form-urlencoded` body and the API key as an
 * ordinary `apiToken` field — not JSON with a Bearer header, which is
 * what this Gateway assumed while it was modeled on Meta's Cloud API.
 *
 * Deliberately NOT wrapped in a retry: a blind retry of a send after
 * an ambiguous network failure risks a duplicate message landing in
 * the customer's WhatsApp thread — the same reasoning `DarajaGateway`
 * applies to STK push initiation. Retry decisions belong to callers
 * with conversation state to reason about (`NotificationService`).
 */
async function postForm(
  businessId: string,
  config: WhatchimpConfig,
  path: string,
  params: Record<string, string | undefined>,
): Promise<WhatchimpResponse> {
  return withCircuitBreaker(`${GATEWAY_NAME}:${businessId}`, async () => {
    const body = new URLSearchParams({ apiToken: config.apiKey });
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        body.set(key, value);
      }
    }

    const response = await fetch(`${config.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });

    const data = (await response.json().catch(() => ({}))) as WhatchimpResponse;
    if (!response.ok || !isOkStatus(data.status)) {
      const reason = typeof data.message === 'string' ? data.message : `HTTP ${response.status}`;
      throw new Error(`Whatchimp ${path} failed: ${reason}`);
    }
    return data;
  });
}

/** WhatChimp requires "country code, numeric characters only" — no `+`, spaces, or dashes. */
function toWhatchimpPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

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

/**
 * Every method below now targets a real, documented WhatChimp
 * endpoint from its developer console. This Gateway was previously
 * modeled on Meta's Cloud API wire format as a disclosed placeholder,
 * because no WhatChimp documentation was available when it was
 * written; that assumption turned out to be wrong in every particular
 * (host, path, encoding, auth, and response shape), so all of it has
 * been replaced.
 *
 * Where the interface declares a capability WhatChimp genuinely does
 * not expose, the method throws `WhatchimpCapabilityNotSupportedError`
 * rather than calling a fabricated endpoint — see each one's comment
 * for what WhatChimp offers instead.
 */
class WhatchimpGateway implements WhatsAppGateway, ProductCatalogGateway {
  /** `POST /whatsapp/send` — a session message, only deliverable inside WhatsApp's 24-hour customer-initiated window. */
  async sendMessage(input: {
    businessId: string;
    phone: string;
    text: string;
  }): Promise<WhatsAppSendResult> {
    const config = await getWhatchimpConfig(input.businessId);
    const data = await postForm(input.businessId, config, '/whatsapp/send', {
      phone_number_id: config.phoneNumberId,
      phone_number: toWhatchimpPhone(input.phone),
      message: input.text,
    });
    // A missing id on an otherwise-successful send costs us only the
    // transcript's provider reference — throwing here would make the
    // caller treat a *delivered* message as failed and risk sending
    // the customer a duplicate, which is strictly worse.
    return { providerMessageId: data.wa_message_id ?? '' };
  }

  /**
   * WhatChimp's developer console exposes template sending only as a
   * UI generator ("Send Template Message"), with no documented
   * endpoint or parameters — unlike every other call in this file.
   * Left unimplemented rather than guessed at a second time.
   *
   * This matters for any message sent *outside* the 24-hour session
   * window (e.g. a shipment update days after purchase); order
   * confirmations, which land seconds after payment, go through
   * `sendMessage` and are unaffected.
   */
  async sendTemplate(): Promise<WhatsAppSendResult> {
    throw new WhatchimpCapabilityNotSupportedError(
      'sendTemplate',
      'its developer console documents template sending only as a UI generator, with no endpoint or parameters published.',
    );
  }

  /**
   * `POST /whatsapp/send/interactive-buttons`. WhatChimp's real limits
   * (1–3 buttons, 20-character titles) are enforced here rather than
   * discovered as a rejected send — these are our own bugs to catch.
   * The `id` set on each button is what comes back when the customer
   * taps it, which is how the conversation engine will route replies
   * once the inbound webhook payload is known.
   */
  async sendButtons(input: {
    businessId: string;
    phone: string;
    bodyText: string;
    buttons: { id: string; title: string }[];
  }): Promise<WhatsAppSendResult> {
    if (input.buttons.length < 1 || input.buttons.length > 3) {
      throw new Error(
        `Whatchimp accepts between 1 and 3 reply buttons, got ${input.buttons.length}.`,
      );
    }
    const tooLong = input.buttons.find((button) => button.title.length > 20);
    if (tooLong) {
      throw new Error(
        `Whatchimp button titles are limited to 20 characters — "${tooLong.title}" is ${tooLong.title.length}.`,
      );
    }

    const config = await getWhatchimpConfig(input.businessId);
    const data = await postForm(input.businessId, config, '/whatsapp/send/interactive-buttons', {
      phone_number_id: config.phoneNumberId,
      phone_number: toWhatchimpPhone(input.phone),
      message: input.bodyText,
      buttons: JSON.stringify(
        input.buttons.map((button) => ({ id: button.id, title: button.title })),
      ),
    });
    return { providerMessageId: data.wa_message_id ?? '' };
  }

  /**
   * WhatChimp exposes reply buttons but no list message. The nearest
   * real capability is `sendButtons` (max 3 options); anything longer
   * has to be rendered as numbered text, which is what the
   * conversation state machine already produces.
   */
  async sendList(): Promise<WhatsAppSendResult> {
    throw new WhatchimpCapabilityNotSupportedError(
      'sendList',
      'its API exposes interactive reply buttons (max 3) but no list message. Use sendButtons, or a numbered text menu for longer option sets.',
    );
  }

  /**
   * WhatChimp's catalog API is management-only — list catalogs, sync a
   * catalog from Meta, list/patch catalog *orders*. There is no
   * endpoint for pushing an interactive product message into a
   * customer's thread.
   */
  async sendCatalogMessage(): Promise<WhatsAppSendResult> {
    throw new WhatchimpCapabilityNotSupportedError(
      'sendCatalogMessage',
      'its catalog API covers catalog listing/sync and order management only, with no send-product-message endpoint.',
    );
  }

  /** WhatChimp exposes delivery status as a *read* (`/whatsapp/get/message-status`) but offers no way to mark an inbound message read. */
  async markAsRead(): Promise<void> {
    throw new WhatchimpCapabilityNotSupportedError(
      'markAsRead',
      'its API can read a message\'s delivery status but cannot mark an inbound message as read.',
    );
  }

  /**
   * WhatChimp's catalog API can list catalogs and trigger a *whole-
   * catalog* re-sync (`/whatsapp/catalog/sync`), but that pulls
   * WhatChimp's copy from Meta Commerce Manager — it is not a way to
   * push an individual product's name/price/availability from here.
   * A per-item upsert simply doesn't exist, so this reports the gap
   * instead of pretending to publish.
   *
   * `ProductService.syncToCatalog` already treats this as best-effort,
   * so a product still saves normally; the catalog just has to be
   * maintained in Commerce Manager until a real push API exists.
   */
  async syncItem(): Promise<void> {
    throw new WhatchimpCapabilityNotSupportedError(
      'syncItem',
      'its catalog API only triggers a whole-catalog pull from Meta Commerce Manager; there is no per-item push. Maintain the catalog in Commerce Manager.',
    );
  }

  async removeItem(): Promise<void> {
    throw new WhatchimpCapabilityNotSupportedError(
      'removeItem',
      'its catalog API has no per-item delete; remove the product in Meta Commerce Manager.',
    );
  }

  /**
   * `POST /whatsapp/subscriber/chat/add-notes`, plus
   * `POST /whatsapp/subscriber/chat/assign-to-team-member` when the
   * tenant has configured a `teamMemberId` (that endpoint requires a
   * real team member id, which this platform has no concept of on its
   * own). The note is the part that carries the *reason* an agent
   * actually needs, so it is always written even when no team member
   * is configured.
   *
   * Best-effort by contract: Snack Quest OS's own Firestore state is
   * the source of truth for the handoff regardless of whether the BSP
   * inbox reflects it — see `ConversationService.escalateToAgent`.
   */
  async assignHumanAgent(input: {
    businessId: string;
    phone: string;
    reason: string;
  }): Promise<void> {
    const config = await getWhatchimpConfig(input.businessId);
    const phone = toWhatchimpPhone(input.phone);

    await postForm(input.businessId, config, '/whatsapp/subscriber/chat/add-notes', {
      phone_number_id: config.phoneNumberId,
      phone_number: phone,
      note_text: `Escalated to a human agent — reason: ${input.reason}`,
    });

    if (config.teamMemberId) {
      await postForm(input.businessId, config, '/whatsapp/subscriber/chat/assign-to-team-member', {
        phone_number_id: config.phoneNumberId,
        phone_number: phone,
        team_member_id: config.teamMemberId,
      });
    }
  }

  /**
   * WhatChimp has no conversation-status field to set. The closest
   * real, durable equivalent is a subscriber note, which is what an
   * agent opening the thread will actually see — so that is what this
   * writes, rather than inventing a status endpoint.
   */
  async updateConversationStatus(input: {
    businessId: string;
    phone: string;
    status: string;
  }): Promise<void> {
    const config = await getWhatchimpConfig(input.businessId);
    await postForm(input.businessId, config, '/whatsapp/subscriber/chat/add-notes', {
      phone_number_id: config.phoneNumberId,
      phone_number: toWhatchimpPhone(input.phone),
      note_text: `Snack Quest conversation status: ${input.status}`,
    });
  }

  /**
   * ⚠️ STILL MODELED ON META'S CLOUD API — NOT YET VERIFIED AGAINST
   * WHATCHIMP. WhatChimp's developer console documents its outbound
   * REST API in full but publishes no schema for the payload its
   * "Trigger Webhook for Incoming Message" setting POSTs to us, so
   * this is the one piece of the Gateway that could not be corrected
   * from documentation.
   *
   * It is deliberately left as-is (rather than deleted or guessed at
   * a second time) so the existing webhook route keeps compiling and
   * behaving exactly as it does today. It will be rewritten from a
   * real captured payload — see
   * `app/api/webhooks/whatchimp/inspect/route.ts`, the temporary
   * recorder that exists purely to capture one.
   *
   * Two things the capture must settle before the production parser
   * can be written:
   *   1. whether the payload carries `phone_number_id` (or any stable
   *      tenant identifier) — if not, tenant resolution moves to
   *      per-business webhook URLs, as Daraja and Jumia already use;
   *   2. how a tapped reply button arrives, since `sendButtons` sets
   *      an `id` per button that WhatChimp says comes back on the
   *      button-reply payload.
   */
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

/**
 * "Test Connection" (§ Integration Portal) — `POST /whatsapp/label/list`
 * is a real, documented, side-effect-free WhatChimp call that exercises
 * both halves of a tenant's credentials at once: it fails on a bad
 * `apiToken` and on a `phone_number_id` the account doesn't own. It
 * never sends a message, so no customer is ever touched by a test.
 */
export async function testWhatchimpConnection(businessId: string): Promise<void> {
  const config = await getWhatchimpConfig(businessId);
  const body = new URLSearchParams({
    apiToken: config.apiKey,
    phone_number_id: config.phoneNumberId,
  });
  const response = await fetch(`${config.baseUrl}/whatsapp/label/list`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  const data = (await response.json().catch(() => ({}))) as { status?: unknown; message?: unknown };
  if (!response.ok || !isOkStatus(data.status)) {
    const reason = typeof data.message === 'string' ? data.message : `HTTP ${response.status}`;
    throw new Error(`Whatchimp connection test failed: ${reason}`);
  }
}
