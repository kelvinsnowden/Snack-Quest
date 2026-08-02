import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendGridGateway } from '@/lib/integrations/email/sendGridGateway';

const ORIGINAL_API_KEY = process.env.SENDGRID_API_KEY;
const ORIGINAL_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;

beforeEach(() => {
  process.env.SENDGRID_API_KEY = 'test-sendgrid-key';
  process.env.SENDGRID_FROM_EMAIL = 'orders@snackquest.co';
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_API_KEY === undefined) {
    delete process.env.SENDGRID_API_KEY;
  } else {
    process.env.SENDGRID_API_KEY = ORIGINAL_API_KEY;
  }
  if (ORIGINAL_FROM_EMAIL === undefined) {
    delete process.env.SENDGRID_FROM_EMAIL;
  } else {
    process.env.SENDGRID_FROM_EMAIL = ORIGINAL_FROM_EMAIL;
  }
});

describe('SendGridGateway.send', () => {
  it('posts to the v3 mail/send API and returns the X-Message-Id header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 202, headers: { 'x-message-id': 'sg-msg-1' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendGridGateway.send({ to: 'creator@example.com', subject: 'Welcome', body: 'Hi there' });

    expect(result).toEqual({ providerMessageId: 'sg-msg-1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect(init.headers.Authorization).toBe('Bearer test-sendgrid-key');
    const body = JSON.parse(init.body as string);
    expect(body.personalizations[0].to[0].email).toBe('creator@example.com');
    expect(body.from.email).toBe('orders@snackquest.co');
    expect(body.subject).toBe('Welcome');
  });

  it('throws when SendGrid responds with a non-2xx status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })),
    );

    await expect(
      sendGridGateway.send({ to: 'creator@example.com', subject: 'Welcome', body: 'Hi there' }),
    ).rejects.toThrow(/SendGrid send failed \(401\)/);
  });

  it('throws when SendGrid accepts the request but omits X-Message-Id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 202 })));

    await expect(
      sendGridGateway.send({ to: 'creator@example.com', subject: 'Welcome', body: 'Hi there' }),
    ).rejects.toThrow(/returned no X-Message-Id header/);
  });

  it('throws when SENDGRID_API_KEY or SENDGRID_FROM_EMAIL is missing, without making a request', async () => {
    delete process.env.SENDGRID_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendGridGateway.send({ to: 'a@b.com', subject: 's', body: 'b' })).rejects.toThrow(
      /Missing SENDGRID_API_KEY/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
