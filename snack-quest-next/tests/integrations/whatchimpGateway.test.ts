import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { whatchimpGateway, testWhatchimpConnection } from '@/lib/integrations/whatchimp/whatchimpGateway';
import { WhatchimpCapabilityNotSupportedError } from '@/lib/integrations/whatchimp/config';
import { IntegrationSecretNotFoundError } from '@/repositories/businessIntegrationSecretRepository';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';

const BUSINESS_ID = 'biz-whatchimp-test';
const OTHER_BUSINESS_ID = 'biz-whatchimp-other';

const SECRET = { apiKey: 'test-key', phoneNumberId: '1234567890' };

describe('WhatchimpGateway.parseIncomingMessage', () => {
  it('parses a free-text inbound message, including which WhatsApp number received it', () => {
    const result = whatchimpGateway.parseIncomingMessage({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: '1234567890' },
                messages: [
                  {
                    id: 'wamid.1',
                    from: '254700000000',
                    timestamp: '1700000000',
                    type: 'text',
                    text: { body: 'hello' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(result).toEqual({
      providerMessageId: 'wamid.1',
      fromPhone: '254700000000',
      toPhoneNumberId: '1234567890',
      text: 'hello',
      selectedId: undefined,
      receivedAt: new Date(1700000000 * 1000).toISOString(),
    });
  });

  it('parses a button-reply inbound message with selectedId', () => {
    const result = whatchimpGateway.parseIncomingMessage({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: '1234567890' },
                messages: [
                  {
                    id: 'wamid.2',
                    from: '254700000000',
                    timestamp: '1700000000',
                    type: 'interactive',
                    interactive: {
                      type: 'button_reply',
                      button_reply: { id: 'box-2500', title: 'Starter Box' },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(result.selectedId).toBe('box-2500');
    expect(result.text).toBe('Starter Box');
  });

  it('throws on a malformed payload', () => {
    expect(() => whatchimpGateway.parseIncomingMessage({})).toThrow(
      /Malformed Whatchimp webhook payload/,
    );
  });

  it('throws when metadata.phone_number_id is missing (can\'t resolve a tenant)', () => {
    expect(() =>
      whatchimpGateway.parseIncomingMessage({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: 'wamid.3',
                      from: '254700000000',
                      timestamp: '1700000000',
                      type: 'text',
                      text: { body: 'hello' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    ).toThrow(/Malformed Whatchimp webhook payload/);
  });

  it('parses the real WhatsApp Cloud API "order" message ("Receive Order") into a structured catalogOrder', () => {
    const result = whatchimpGateway.parseIncomingMessage({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: '1234567890' },
                messages: [
                  {
                    id: 'wamid.order-1',
                    from: '254700000000',
                    timestamp: '1700000000',
                    type: 'order',
                    order: {
                      catalog_id: 'catalog-1',
                      text: 'here you go',
                      product_items: [
                        { product_retailer_id: 'box-2500', quantity: 1, item_price: 2500 },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(result.catalogOrder).toEqual({
      catalogId: 'catalog-1',
      items: [{ productRetailerId: 'box-2500', quantity: 1, itemPriceKes: 2500 }],
      text: 'here you go',
    });
  });

  it('leaves catalogOrder undefined for an ordinary text message', () => {
    const result = whatchimpGateway.parseIncomingMessage({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: '1234567890' },
                messages: [
                  {
                    id: 'wamid.4',
                    from: '254700000000',
                    timestamp: '1700000000',
                    type: 'text',
                    text: { body: 'hello' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(result.catalogOrder).toBeUndefined();
  });
});

describe('WhatchimpGateway.verifyWebhookChallenge', () => {
  // Platform-level, not tenant-scoped — see lib/integrations/whatchimp/config.ts.
  beforeEach(() => {
    process.env.WHATCHIMP_WEBHOOK_VERIFY_TOKEN = 'verify-me';
  });
  afterEach(() => {
    delete process.env.WHATCHIMP_WEBHOOK_VERIFY_TOKEN;
  });

  it('echoes the challenge on a valid verify request', () => {
    const result = whatchimpGateway.verifyWebhookChallenge({
      mode: 'subscribe',
      token: 'verify-me',
      challenge: 'abc123',
    });
    expect(result).toBe('abc123');
  });

  it('rejects a mismatched verify token', () => {
    const result = whatchimpGateway.verifyWebhookChallenge({
      mode: 'subscribe',
      token: 'wrong-token',
      challenge: 'abc123',
    });
    expect(result).toBeNull();
  });
});


/**
 * Everything below exercises WhatChimp's *real*, documented API:
 * form-encoded POSTs to `app.whatchimp.com/api/v1/whatsapp/...` with
 * the key as an `apiToken` field, and a JSON body whose `status` — not
 * the HTTP code — carries success or failure. The previous suite
 * asserted Meta Cloud API shapes, which this Gateway was modeled on
 * before any WhatChimp documentation existed.
 */

/** WhatChimp's success envelope. */
function whatchimpOk(extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ status: '1', message: 'ok', ...extra }), { status: 200 });
}

/** WhatChimp's failure envelope — note the HTTP 200. */
function whatchimpFail(message: string): Response {
  return new Response(JSON.stringify({ status: '0', message }), { status: 200 });
}

function formBodyOf(call: unknown[]): URLSearchParams {
  return (call[1] as RequestInit).body as URLSearchParams;
}

describe('WhatchimpGateway.sendMessage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws IntegrationSecretNotFoundError when no Whatchimp secret is configured for this business', async () => {
    await expect(
      whatchimpGateway.sendMessage({
        businessId: 'biz-with-no-whatchimp-secret',
        phone: '254700000000',
        text: 'hi',
      }),
    ).rejects.toBeInstanceOf(IntegrationSecretNotFoundError);
  });

  it('posts a form-encoded send to the real endpoint and returns wa_message_id', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', SECRET);
    const fetchMock = vi.fn().mockImplementation(async () => whatchimpOk({ wa_message_id: 'wamid.sent-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await whatchimpGateway.sendMessage({
      businessId: BUSINESS_ID,
      phone: '254700000000',
      text: 'hello there',
    });

    expect(result.providerMessageId).toBe('wamid.sent-1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://app.whatchimp.com/api/v1/whatsapp/send');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      'Content-Type': 'application/x-www-form-urlencoded',
    });

    const body = formBodyOf(fetchMock.mock.calls[0]);
    expect(body.get('apiToken')).toBe('test-key');
    expect(body.get('phone_number_id')).toBe('1234567890');
    expect(body.get('phone_number')).toBe('254700000000');
    expect(body.get('message')).toBe('hello there');
  });

  it('treats WhatChimp’s HTTP-200-with-status-0 as a failure, surfacing its own message', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', SECRET);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => whatchimpFail('Subscriber limit has been exceeded.')));

    await expect(
      whatchimpGateway.sendMessage({ businessId: BUSINESS_ID, phone: '254700000000', text: 'hi' }),
    ).rejects.toThrow(/Subscriber limit has been exceeded/);
  });

  it('strips non-numeric characters from the phone number, as WhatChimp requires', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', SECRET);
    const fetchMock = vi.fn().mockImplementation(async () => whatchimpOk({ wa_message_id: 'wamid.x' }));
    vi.stubGlobal('fetch', fetchMock);

    await whatchimpGateway.sendMessage({ businessId: BUSINESS_ID, phone: '+254 700-000 000', text: 'hi' });

    expect(formBodyOf(fetchMock.mock.calls[0]).get('phone_number')).toBe('254700000000');
  });

  it('sends with the owning tenant’s own credentials, never another’s', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', SECRET);
    await businessIntegrationSecretRepository.set(OTHER_BUSINESS_ID, 'whatchimp', {
      apiKey: 'other-tenant-key',
      phoneNumberId: '999999999',
    });
    const fetchMock = vi.fn().mockImplementation(async () => whatchimpOk({ wa_message_id: 'wamid.sent-2' }));
    vi.stubGlobal('fetch', fetchMock);

    await whatchimpGateway.sendMessage({
      businessId: OTHER_BUSINESS_ID,
      phone: '254700000000',
      text: 'hi from the other tenant',
    });

    const body = formBodyOf(fetchMock.mock.calls[0]);
    expect(body.get('apiToken')).toBe('other-tenant-key');
    expect(body.get('phone_number_id')).toBe('999999999');
  });
});

describe('WhatchimpGateway.sendButtons', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts buttons as a JSON array to the interactive-buttons endpoint', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', SECRET);
    const fetchMock = vi.fn().mockImplementation(async () => whatchimpOk({ wa_message_id: 'wamid.btn-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await whatchimpGateway.sendButtons({
      businessId: BUSINESS_ID,
      phone: '254700000000',
      bodyText: 'How would you like your box delivered?',
      buttons: [
        { id: 'door', title: 'Door Delivery' },
        { id: 'pickup', title: 'Pickup Station' },
      ],
    });

    expect(result.providerMessageId).toBe('wamid.btn-1');
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://app.whatchimp.com/api/v1/whatsapp/send/interactive-buttons',
    );
    const body = formBodyOf(fetchMock.mock.calls[0]);
    expect(body.get('message')).toBe('How would you like your box delivered?');
    expect(JSON.parse(body.get('buttons') ?? '[]')).toEqual([
      { id: 'door', title: 'Door Delivery' },
      { id: 'pickup', title: 'Pickup Station' },
    ]);
  });

  it('rejects more than 3 buttons before making any network call', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', SECRET);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      whatchimpGateway.sendButtons({
        businessId: BUSINESS_ID,
        phone: '254700000000',
        bodyText: 'Pick one',
        buttons: [
          { id: 'a', title: 'A' },
          { id: 'b', title: 'B' },
          { id: 'c', title: 'C' },
          { id: 'd', title: 'D' },
        ],
      }),
    ).rejects.toThrow(/between 1 and 3 reply buttons/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a button title longer than WhatChimp’s 20-character limit', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', SECRET);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      whatchimpGateway.sendButtons({
        businessId: BUSINESS_ID,
        phone: '254700000000',
        bodyText: 'Pick one',
        buttons: [{ id: 'a', title: 'This title is far too long for WhatsApp' }],
      }),
    ).rejects.toThrow(/limited to 20 characters/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('WhatchimpGateway — capabilities WhatChimp genuinely does not expose', () => {
  beforeEach(async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', SECRET);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports the gap instead of calling a fabricated endpoint', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      whatchimpGateway.sendTemplate({
        businessId: BUSINESS_ID,
        phone: '254700000000',
        templateCode: 'order_confirmed',
        params: {},
      }),
    ).rejects.toBeInstanceOf(WhatchimpCapabilityNotSupportedError);

    await expect(
      whatchimpGateway.sendList({
        businessId: BUSINESS_ID,
        phone: '254700000000',
        bodyText: 'Pick a station',
        buttonLabel: 'Stations',
        sections: [],
      }),
    ).rejects.toBeInstanceOf(WhatchimpCapabilityNotSupportedError);

    await expect(
      whatchimpGateway.sendCatalogMessage({
        businessId: BUSINESS_ID,
        phone: '254700000000',
        catalogId: 'cat-1',
        productRetailerIds: ['box-1'],
      }),
    ).rejects.toBeInstanceOf(WhatchimpCapabilityNotSupportedError);

    await expect(whatchimpGateway.markAsRead(BUSINESS_ID, 'wamid.x')).rejects.toBeInstanceOf(
      WhatchimpCapabilityNotSupportedError,
    );

    await expect(
      whatchimpGateway.syncItem(BUSINESS_ID, {
        retailerId: 'box-2500',
        name: 'Starter Box',
        description: 'A box',
        priceKes: 2500,
        imageUrl: null,
        availability: 'in stock',
      }),
    ).rejects.toBeInstanceOf(WhatchimpCapabilityNotSupportedError);

    await expect(whatchimpGateway.removeItem(BUSINESS_ID, 'box-2500')).rejects.toBeInstanceOf(
      WhatchimpCapabilityNotSupportedError,
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('WhatchimpGateway.assignHumanAgent / updateConversationStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('records the escalation reason as a subscriber note, and skips team assignment when no team member is configured', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', SECRET);
    const fetchMock = vi.fn().mockImplementation(async () => whatchimpOk());
    vi.stubGlobal('fetch', fetchMock);

    await whatchimpGateway.assignHumanAgent({
      businessId: BUSINESS_ID,
      phone: '254700000000',
      reason: 'door_delivery_price_confirmation',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://app.whatchimp.com/api/v1/whatsapp/subscriber/chat/add-notes',
    );
    expect(formBodyOf(fetchMock.mock.calls[0]).get('note_text')).toContain(
      'door_delivery_price_confirmation',
    );
  });

  it('also assigns the chat to the configured team member when one is set', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', {
      ...SECRET,
      teamMemberId: '42',
    });
    const fetchMock = vi.fn().mockImplementation(async () => whatchimpOk());
    vi.stubGlobal('fetch', fetchMock);

    await whatchimpGateway.assignHumanAgent({
      businessId: BUSINESS_ID,
      phone: '254700000000',
      reason: 'door_delivery_price_confirmation',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      'https://app.whatchimp.com/api/v1/whatsapp/subscriber/chat/assign-to-team-member',
    );
    expect(formBodyOf(fetchMock.mock.calls[1]).get('team_member_id')).toBe('42');
  });

  it('throws on a rejected call — every caller treats this as best-effort', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', SECRET);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => whatchimpFail('Subscriber not found.')));

    await expect(
      whatchimpGateway.assignHumanAgent({
        businessId: BUSINESS_ID,
        phone: '254700000000',
        reason: 'whatever',
      }),
    ).rejects.toThrow(/Subscriber not found/);
  });

  it('records a conversation status change as a subscriber note', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', SECRET);
    const fetchMock = vi.fn().mockImplementation(async () => whatchimpOk());
    vi.stubGlobal('fetch', fetchMock);

    await whatchimpGateway.updateConversationStatus({
      businessId: BUSINESS_ID,
      phone: '254700000000',
      status: 'resolved',
    });

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://app.whatchimp.com/api/v1/whatsapp/subscriber/chat/add-notes',
    );
    expect(formBodyOf(fetchMock.mock.calls[0]).get('note_text')).toContain('resolved');
  });
});

describe('testWhatchimpConnection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves against the real, side-effect-free label list endpoint', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', SECRET);
    const fetchMock = vi.fn().mockImplementation(async () => whatchimpOk({ message: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(testWhatchimpConnection(BUSINESS_ID)).resolves.toBeUndefined();

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://app.whatchimp.com/api/v1/whatsapp/label/list',
    );
    const body = formBodyOf(fetchMock.mock.calls[0]);
    expect(body.get('apiToken')).toBe('test-key');
    expect(body.get('phone_number_id')).toBe('1234567890');
  });

  it('throws with WhatChimp’s own reason on a rejected credential', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', SECRET);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => whatchimpFail('WhatsApp account not found.')));

    await expect(testWhatchimpConnection(BUSINESS_ID)).rejects.toThrow(/WhatsApp account not found/);
  });
});
