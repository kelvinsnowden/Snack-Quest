import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { whatchimpGateway } from '@/lib/integrations/whatchimp/whatchimpGateway';
import { WhatchimpConfigError } from '@/lib/integrations/whatchimp/config';

const REQUIRED_ENV = {
  WHATCHIMP_API_KEY: 'test-key',
  WHATCHIMP_PHONE_NUMBER_ID: '1234567890',
  WHATCHIMP_WEBHOOK_VERIFY_TOKEN: 'verify-me',
};

function setEnv(vars: Record<string, string>) {
  for (const [key, value] of Object.entries(vars)) {
    process.env[key] = value;
  }
}

function clearEnv() {
  for (const key of Object.keys(REQUIRED_ENV)) {
    delete process.env[key];
  }
}

describe('WhatchimpGateway.parseIncomingMessage', () => {
  it('parses a free-text inbound message', () => {
    const result = whatchimpGateway.parseIncomingMessage({
      entry: [
        {
          changes: [
            {
              value: {
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
});

describe('WhatchimpGateway.verifyWebhookChallenge', () => {
  beforeEach(() => {
    clearEnv();
    setEnv(REQUIRED_ENV);
  });
  afterEach(clearEnv);

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
  beforeEach(() => {
    clearEnv();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    clearEnv();
  });

  it('throws WhatchimpConfigError when credentials are not configured', async () => {
    await expect(
      whatchimpGateway.sendMessage({ phone: '254700000000', text: 'hi' }),
    ).rejects.toBeInstanceOf(WhatchimpConfigError);
  });

  it('sends a text message and returns the provider message id', async () => {
    setEnv(REQUIRED_ENV);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: 'wamid.sent-1' }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await whatchimpGateway.sendMessage({
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
    setEnv(REQUIRED_ENV);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'invalid phone number' } }), {
        status: 400,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      whatchimpGateway.sendMessage({ phone: 'not-a-phone', text: 'hi' }),
    ).rejects.toThrow(/Whatchimp send failed/);
  });
});
