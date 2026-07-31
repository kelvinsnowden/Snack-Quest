import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyWebhookChallengeMock, parseIncomingMessageMock } = vi.hoisted(() => ({
  verifyWebhookChallengeMock: vi.fn(),
  parseIncomingMessageMock: vi.fn(),
}));

vi.mock('@/lib/integrations/whatchimp/whatchimpGateway', () => ({
  whatchimpGateway: {
    verifyWebhookChallenge: verifyWebhookChallengeMock,
    parseIncomingMessage: parseIncomingMessageMock,
  },
}));

import { GET as webhookGet, POST as webhookPost } from '@/app/api/webhooks/whatchimp/route';

/**
 * `?key=` origin verification on the shared Whatchimp webhook URL
 * (§ Secure the Daraja and Whatchimp webhook routes) — applies to both
 * verbs. Downstream message processing is already covered by
 * tests/integration/catalogCheckoutApi.test.ts (which runs with no
 * `WHATCHIMP_WEBHOOK_SECRET` set, i.e. the fail-open path exercised
 * here too); this file only proves the gate itself.
 */

const ORIGINAL_SECRET = process.env.WHATCHIMP_WEBHOOK_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.WHATCHIMP_WEBHOOK_SECRET;
  } else {
    process.env.WHATCHIMP_WEBHOOK_SECRET = ORIGINAL_SECRET;
  }
});

describe('GET /api/webhooks/whatchimp', () => {
  it('passes through to the handshake when no secret is configured (fail-open)', async () => {
    delete process.env.WHATCHIMP_WEBHOOK_SECRET;
    verifyWebhookChallengeMock.mockReturnValue('the-challenge');

    const response = await webhookGet(
      new Request('http://localhost/api/webhooks/whatchimp?hub.mode=subscribe&hub.verify_token=t&hub.challenge=the-challenge'),
    );

    expect(response.status).toBe(200);
  });

  it('rejects a missing key once a secret is configured', async () => {
    process.env.WHATCHIMP_WEBHOOK_SECRET = 'real-secret';

    const response = await webhookGet(new Request('http://localhost/api/webhooks/whatchimp'));

    expect(response.status).toBe(403);
    expect(verifyWebhookChallengeMock).not.toHaveBeenCalled();
  });

  it('rejects a wrong key once a secret is configured', async () => {
    process.env.WHATCHIMP_WEBHOOK_SECRET = 'real-secret';

    const response = await webhookGet(new Request('http://localhost/api/webhooks/whatchimp?key=wrong'));

    expect(response.status).toBe(403);
  });

  it('passes a matching key through to the handshake once a secret is configured', async () => {
    process.env.WHATCHIMP_WEBHOOK_SECRET = 'real-secret';
    verifyWebhookChallengeMock.mockReturnValue('the-challenge');

    const response = await webhookGet(
      new Request(
        'http://localhost/api/webhooks/whatchimp?key=real-secret&hub.mode=subscribe&hub.verify_token=t&hub.challenge=the-challenge',
      ),
    );

    expect(response.status).toBe(200);
    expect(verifyWebhookChallengeMock).toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/whatchimp', () => {
  beforeEach(() => {
    parseIncomingMessageMock.mockImplementation(() => {
      throw new Error('not a message');
    });
  });

  it('rejects a wrong key once a secret is configured, without parsing the payload', async () => {
    process.env.WHATCHIMP_WEBHOOK_SECRET = 'real-secret';

    const response = await webhookPost(
      new Request('http://localhost/api/webhooks/whatchimp?key=wrong', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(403);
    expect(parseIncomingMessageMock).not.toHaveBeenCalled();
  });

  it('passes a matching key through to message processing once a secret is configured', async () => {
    process.env.WHATCHIMP_WEBHOOK_SECRET = 'real-secret';

    const response = await webhookPost(
      new Request('http://localhost/api/webhooks/whatchimp?key=real-secret', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );

    // parseIncomingMessage throws in this test's setup — the route treats that as
    // "not a customer message" and still 200s, but the key point is it got there.
    expect(response.status).toBe(200);
    expect(parseIncomingMessageMock).toHaveBeenCalled();
  });
});
