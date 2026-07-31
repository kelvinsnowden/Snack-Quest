import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { whatchimpGateway } from '@/lib/integrations/whatchimp/whatchimpGateway';
import { CatalogNotConfiguredError } from '@/lib/integrations/whatchimp/config';
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

  it('sends a text message and returns the provider message id', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', SECRET);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: 'wamid.sent-1' }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await whatchimpGateway.sendMessage({
      businessId: BUSINESS_ID,
      phone: '254700000000',
      text: 'hello there',
    });

    expect(result.providerMessageId).toBe('wamid.sent-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/1234567890/messages');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ to: '254700000000', type: 'text' });
  });

  it('throws when Whatchimp rejects the send', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', SECRET);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'invalid phone number' } }), {
        status: 400,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      whatchimpGateway.sendMessage({
        businessId: BUSINESS_ID,
        phone: 'not-a-phone',
        text: 'hi',
      }),
    ).rejects.toThrow(/Whatchimp send failed/);
  });

  it('uses a different tenant\'s phone_number_id when sending on their behalf', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', SECRET);
    await businessIntegrationSecretRepository.set(OTHER_BUSINESS_ID, 'whatchimp', {
      apiKey: 'other-tenant-key',
      phoneNumberId: '999999999',
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: 'wamid.sent-2' }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await whatchimpGateway.sendMessage({
      businessId: OTHER_BUSINESS_ID,
      phone: '254700000000',
      text: 'hi from the other tenant',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/999999999/messages');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer other-tenant-key');
  });
});

describe('WhatchimpGateway.syncItem / removeItem', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws CatalogNotConfiguredError when the business has no catalogId set', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', SECRET); // no catalogId
    await expect(
      whatchimpGateway.syncItem(BUSINESS_ID, {
        retailerId: 'box-2500',
        name: 'Starter Box',
        description: 'desc',
        priceKes: 2500,
        imageUrl: null,
        availability: 'in stock',
      }),
    ).rejects.toBeInstanceOf(CatalogNotConfiguredError);
  });

  it('calls the real Meta Catalog Batch API shape with an UPDATE request', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', {
      ...SECRET,
      catalogId: 'catalog-1',
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await whatchimpGateway.syncItem(BUSINESS_ID, {
      retailerId: 'box-2500',
      name: 'Starter Box',
      description: 'A starter box',
      priceKes: 2500,
      imageUrl: null,
      availability: 'in stock',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/catalog-1/items_batch');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.requests).toEqual([
      {
        method: 'UPDATE',
        data: {
          id: 'box-2500',
          name: 'Starter Box',
          description: 'A starter box',
          availability: 'in stock',
          condition: 'new',
          price: '2500 KES',
          currency: 'KES',
        },
      },
    ]);
  });

  it('throws with the provider error message when the batch call fails', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', {
      ...SECRET,
      catalogId: 'catalog-1',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'catalog offline' } }), { status: 500 }),
      ),
    );

    await expect(
      whatchimpGateway.syncItem(BUSINESS_ID, {
        retailerId: 'box-2500',
        name: 'Starter Box',
        description: 'desc',
        priceKes: 2500,
        imageUrl: null,
        availability: 'in stock',
      }),
    ).rejects.toThrow(/catalog offline/);
  });

  it('removeItem sends a DELETE request keyed by retailerId', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', {
      ...SECRET,
      catalogId: 'catalog-1',
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await whatchimpGateway.removeItem(BUSINESS_ID, 'box-2500');

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.requests).toEqual([{ method: 'DELETE', data: { id: 'box-2500' } }]);
  });
});

describe('WhatchimpGateway.sendCatalogMessage / assignHumanAgent / updateConversationStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a real Meta interactive product_list message', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', SECRET);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: 'wamid.catalog-1' }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await whatchimpGateway.sendCatalogMessage({
      businessId: BUSINESS_ID,
      phone: '254700000000',
      catalogId: 'catalog-1',
      productRetailerIds: ['box-2500', 'box-3500'],
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.interactive.type).toBe('product_list');
    expect(body.interactive.action.catalog_id).toBe('catalog-1');
    expect(body.interactive.action.sections[0].product_items).toEqual([
      { product_retailer_id: 'box-2500' },
      { product_retailer_id: 'box-3500' },
    ]);
  });

  it('assignHumanAgent posts the escalation reason', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', SECRET);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await whatchimpGateway.assignHumanAgent({
      businessId: BUSINESS_ID,
      phone: '254700000000',
      reason: 'door_delivery_price_confirmation',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/1234567890/conversations/254700000000/assign');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.reason).toBe('door_delivery_price_confirmation');
  });

  it('assignHumanAgent throws on a non-OK response — every caller treats this as best-effort', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', SECRET);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    await expect(
      whatchimpGateway.assignHumanAgent({
        businessId: BUSINESS_ID,
        phone: '254700000000',
        reason: 'door_delivery_price_confirmation',
      }),
    ).rejects.toThrow(/assignHumanAgent failed/);
  });

  it('updateConversationStatus posts the new status', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', SECRET);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await whatchimpGateway.updateConversationStatus({
      businessId: BUSINESS_ID,
      phone: '254700000000',
      status: 'resolved',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/1234567890/conversations/254700000000/status');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.status).toBe('resolved');
  });
});
