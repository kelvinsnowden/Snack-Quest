import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { whatchimpGateway } from '@/lib/integrations/whatchimp/whatchimpGateway';
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
