import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { webhookInspectionRepository } from '@/repositories/webhookInspectionRepository';
import { GET as inspectGet, POST as inspectPost } from '@/app/api/webhooks/whatchimp/inspect/route';

/**
 * The temporary WhatChimp webhook capture (§ WhatChimp Integration
 * Redesign — capture before parsing). These assert the two properties
 * the capture actually depends on: it never rejects or errors back at
 * WhatChimp (which could disable the webhook or trigger a retry
 * storm), and it records the payload in a form that's actually usable
 * for writing `parseIncomingMessage` — including form-encoded bodies,
 * since WhatChimp's own outbound API is entirely form-encoded.
 */

async function clean() {
  await adminFirestore.recursiveDelete(adminFirestore.collection('webhookInspections'));
}

function post(body: string, contentType: string, extraHeaders: Record<string, string> = {}, query = ''): Promise<Response> {
  return inspectPost(
    new Request(`http://localhost/api/webhooks/whatchimp/inspect${query}`, {
      method: 'POST',
      headers: { 'content-type': contentType, ...extraHeaders },
      body,
    }),
  );
}

beforeEach(async () => {
  await clean();
  delete process.env.WHATCHIMP_WEBHOOK_SECRET;
});

afterEach(() => {
  delete process.env.WHATCHIMP_WEBHOOK_SECRET;
});

describe('POST /api/webhooks/whatchimp/inspect', () => {
  it('records a JSON payload and always answers 200', async () => {
    const response = await post(
      JSON.stringify({ phone_number_id: 'wa-1', from: '254700000000', text: 'hi' }),
      'application/json',
    );
    expect(response.status).toBe(200);

    const [captured] = await webhookInspectionRepository.listRecent();
    expect(captured.data.provider).toBe('whatchimp');
    expect(captured.data.method).toBe('POST');
    expect(captured.data.bodyFormat).toBe('json');
    expect(captured.data.parsedBody).toEqual({
      phone_number_id: 'wa-1',
      from: '254700000000',
      text: 'hi',
    });
    expect(captured.data.rawBodyTruncated).toBe(false);
  });

  it('parses a form-encoded payload rather than storing it as an opaque string', async () => {
    const response = await post(
      'phone_number=254700000000&message=hello+there',
      'application/x-www-form-urlencoded',
    );
    expect(response.status).toBe(200);

    const [captured] = await webhookInspectionRepository.listRecent();
    expect(captured.data.bodyFormat).toBe('form');
    expect(captured.data.parsedBody).toEqual({
      phone_number: '254700000000',
      message: 'hello there',
    });
  });

  it('keeps a credential-bearing header’s name but never its value', async () => {
    await post('{}', 'application/json', {
      authorization: 'Bearer super-secret-token-value',
      'x-hub-signature-256': 'sha256=abcdef0123456789',
      'x-whatchimp-event': 'incoming_message',
    });

    const [captured] = await webhookInspectionRepository.listRecent();
    expect(captured.data.headers.authorization).toBe('<redacted: 31 chars>');
    expect(captured.data.headers['x-hub-signature-256']).toBe('<redacted: 23 chars>');
    // Non-sensitive headers are exactly what we're here to learn about.
    expect(captured.data.headers['x-whatchimp-event']).toBe('incoming_message');
  });

  it('still answers 200 for a body it cannot parse, recording it raw', async () => {
    const response = await post('not json at all', 'text/plain');
    expect(response.status).toBe(200);

    const [captured] = await webhookInspectionRepository.listRecent();
    expect(captured.data.bodyFormat).toBe('unparsed');
    expect(captured.data.rawBody).toBe('not json at all');
    expect(captured.data.parsedBody).toBeNull();
  });

  it('captures query params and a GET probe too', async () => {
    const response = await inspectGet(
      new Request('http://localhost/api/webhooks/whatchimp/inspect?hub.challenge=abc123', { method: 'GET' }),
    );
    expect(response.status).toBe(200);

    const [captured] = await webhookInspectionRepository.listRecent();
    expect(captured.data.method).toBe('GET');
    expect(captured.data.queryParams).toEqual({ 'hub.challenge': 'abc123' });
  });

  it('rejects a wrong key once a webhook secret is configured, and records nothing', async () => {
    process.env.WHATCHIMP_WEBHOOK_SECRET = 'the-real-secret';

    const response = await post('{}', 'application/json', {}, '?key=wrong');
    expect(response.status).toBe(403);
    expect(await webhookInspectionRepository.listRecent()).toHaveLength(0);
  });

  it('accepts the matching key when a secret is configured', async () => {
    process.env.WHATCHIMP_WEBHOOK_SECRET = 'the-real-secret';

    const response = await post('{}', 'application/json', {}, '?key=the-real-secret');
    expect(response.status).toBe(200);
    expect(await webhookInspectionRepository.listRecent()).toHaveLength(1);
  });
});
