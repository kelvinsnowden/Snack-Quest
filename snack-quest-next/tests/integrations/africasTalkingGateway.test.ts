import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { africasTalkingGateway } from '@/lib/integrations/sms/africasTalkingGateway';

const ORIGINAL_API_KEY = process.env.AFRICAS_TALKING_API_KEY;
const ORIGINAL_USERNAME = process.env.AFRICAS_TALKING_USERNAME;

beforeEach(() => {
  process.env.AFRICAS_TALKING_API_KEY = 'test-at-key';
  process.env.AFRICAS_TALKING_USERNAME = 'sandbox';
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_API_KEY === undefined) {
    delete process.env.AFRICAS_TALKING_API_KEY;
  } else {
    process.env.AFRICAS_TALKING_API_KEY = ORIGINAL_API_KEY;
  }
  if (ORIGINAL_USERNAME === undefined) {
    delete process.env.AFRICAS_TALKING_USERNAME;
  } else {
    process.env.AFRICAS_TALKING_USERNAME = ORIGINAL_USERNAME;
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('AfricasTalkingGateway.send', () => {
  it('posts form-encoded to the sandbox host when username is "sandbox"', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        SMSMessageData: {
          Message: 'Sent',
          Recipients: [{ number: '254700000000', status: 'Success', statusCode: 101, messageId: 'at-msg-1', cost: 'KES 0.80' }],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await africasTalkingGateway.send({ to: '254700000000', body: 'You earned KES 500' });

    expect(result).toEqual({ providerMessageId: 'at-msg-1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.sandbox.africastalking.com/version1/messaging');
    expect(init.headers.apiKey).toBe('test-at-key');
    const params = new URLSearchParams(init.body as string);
    expect(params.get('username')).toBe('sandbox');
    expect(params.get('to')).toBe('254700000000');
    expect(params.get('message')).toBe('You earned KES 500');
  });

  it('posts to the production host for a real (non-"sandbox") username', async () => {
    process.env.AFRICAS_TALKING_USERNAME = 'snackquest';
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        SMSMessageData: {
          Message: 'Sent',
          Recipients: [{ number: '254700000000', status: 'Success', statusCode: 101, messageId: 'at-msg-2', cost: 'KES 0.80' }],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await africasTalkingGateway.send({ to: '254700000000', body: 'hi' });

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.africastalking.com/version1/messaging');
  });

  it('throws when the recipient statusCode is not 101', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          SMSMessageData: {
            Message: 'Failed',
            Recipients: [{ number: '254700000000', status: 'InvalidPhoneNumber', statusCode: 400, messageId: 'None', cost: 'KES 0.00' }],
          },
        }),
      ),
    );

    await expect(africasTalkingGateway.send({ to: '254700000000', body: 'hi' })).rejects.toThrow(
      /Africa's Talking send failed/,
    );
  });

  it('throws when AFRICAS_TALKING_API_KEY or AFRICAS_TALKING_USERNAME is missing, without making a request', async () => {
    delete process.env.AFRICAS_TALKING_USERNAME;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(africasTalkingGateway.send({ to: '254700000000', body: 'hi' })).rejects.toThrow(
      /Missing AFRICAS_TALKING_API_KEY/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
