import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { applySmsDeliveryReportMock, recordIfNewMock, markProcessedMock, markFailedMock } = vi.hoisted(() => ({
  applySmsDeliveryReportMock: vi.fn(),
  recordIfNewMock: vi.fn(),
  markProcessedMock: vi.fn(),
  markFailedMock: vi.fn(),
}));

vi.mock('@/services/notificationService', () => ({
  notificationService: { applySmsDeliveryReport: applySmsDeliveryReportMock },
}));

vi.mock('@/repositories/webhookEventRepository', () => ({
  webhookEventRepository: {
    recordIfNew: recordIfNewMock,
    markProcessed: markProcessedMock,
    markFailed: markFailedMock,
  },
}));

import { GET as dlrGet, POST as dlrPost } from '@/app/api/webhooks/textsms/dlr/route';

/**
 * Route-level tests for the TextSMS delivery-report callback. The
 * status mapping itself is covered by parseTextSmsDlr.test.ts and the
 * record transitions by notificationService.test.ts; this proves the
 * wire — fail-closed origin check, tolerance of the several payload
 * encodings TextSMS might use (they document none), idempotent
 * recording, and always acking 200 to an authenticated caller so a
 * problem on our side never becomes a redelivery storm on theirs.
 */

const SECRET = 'dlr-secret';
const ORIGINAL_SECRET = process.env.TEXTSMS_DLR_SECRET;
const ORIGINAL_BUSINESS_ID = process.env.SNACK_QUEST_BUSINESS_ID;

function url(key: string | null = SECRET, query: Record<string, string> = {}): string {
  const target = new URL('http://localhost/api/webhooks/textsms/dlr');
  if (key !== null) {
    target.searchParams.set('key', key);
  }
  for (const [name, value] of Object.entries(query)) {
    target.searchParams.set(name, value);
  }
  return target.toString();
}

function jsonRequest(body: unknown, key: string | null = SECRET): Request {
  return new Request(url(key), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  process.env.TEXTSMS_DLR_SECRET = SECRET;
  process.env.SNACK_QUEST_BUSINESS_ID = 'snack-quest';
  recordIfNewMock.mockResolvedValue({ isNew: true });
  applySmsDeliveryReportMock.mockResolvedValue({ outcome: 'delivered', outboundMessageId: 'sms:withdrawal-1' });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.TEXTSMS_DLR_SECRET;
  } else {
    process.env.TEXTSMS_DLR_SECRET = ORIGINAL_SECRET;
  }
  if (ORIGINAL_BUSINESS_ID === undefined) {
    delete process.env.SNACK_QUEST_BUSINESS_ID;
  } else {
    process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL_BUSINESS_ID;
  }
});

describe('TextSMS DLR callback — origin check', () => {
  it('rejects a callback with no key', async () => {
    const response = await dlrPost(jsonRequest({ messageid: '1', status: 'DELIVRD' }, null));

    expect(response.status).toBe(403);
    expect(recordIfNewMock).not.toHaveBeenCalled();
    expect(applySmsDeliveryReportMock).not.toHaveBeenCalled();
  });

  it('rejects a callback with the wrong key', async () => {
    const response = await dlrPost(jsonRequest({ messageid: '1', status: 'DELIVRD' }, 'not-the-secret'));

    expect(response.status).toBe(403);
    expect(applySmsDeliveryReportMock).not.toHaveBeenCalled();
  });

  /**
   * Fail-closed, unlike the Daraja/Whatchimp routes. Those fail open
   * because the check was retrofitted onto live payment traffic; this
   * route is new and only enriches already-correct records, so an
   * unconfigured secret must not leave it open to anyone who can mark
   * real messages bounced.
   */
  it('rejects every callback while TEXTSMS_DLR_SECRET is unconfigured', async () => {
    delete process.env.TEXTSMS_DLR_SECRET;

    const response = await dlrPost(jsonRequest({ messageid: '1', status: 'DELIVRD' }));

    expect(response.status).toBe(403);
    expect(recordIfNewMock).not.toHaveBeenCalled();
  });
});

describe('TextSMS DLR callback — payload encodings', () => {
  it('accepts a JSON body', async () => {
    const response = await dlrPost(jsonRequest({ messageid: 78726470, status: 'DELIVRD' }));

    expect(response.status).toBe(200);
    expect(applySmsDeliveryReportMock).toHaveBeenCalledWith(
      'snack-quest',
      expect.objectContaining({ providerMessageId: '78726470', outcome: 'delivered' }),
    );
  });

  it('accepts a form-encoded body', async () => {
    const response = await dlrPost(
      new Request(url(), {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ messageID: '555', dlrstatus: 'DELIVRD' }).toString(),
      }),
    );

    expect(response.status).toBe(200);
    expect(applySmsDeliveryReportMock).toHaveBeenCalledWith(
      'snack-quest',
      expect.objectContaining({ providerMessageId: '555', outcome: 'delivered' }),
    );
  });

  it('accepts a GET with the report in the query string', async () => {
    const response = await dlrGet(new Request(url(SECRET, { messageid: '777', status: 'UNDELIV' }), { method: 'GET' }));

    expect(response.status).toBe(200);
    expect(applySmsDeliveryReportMock).toHaveBeenCalledWith(
      'snack-quest',
      expect.objectContaining({ providerMessageId: '777', outcome: 'failed' }),
    );
  });

  it('accepts a body sent without a usable content-type header', async () => {
    const response = await dlrPost(
      new Request(url(), { method: 'POST', body: JSON.stringify({ messageid: '888', status: 'DELIVRD' }) }),
    );

    expect(response.status).toBe(200);
    expect(applySmsDeliveryReportMock).toHaveBeenCalledWith(
      'snack-quest',
      expect.objectContaining({ providerMessageId: '888' }),
    );
  });

  it('never persists the shared secret into the webhook ledger', async () => {
    await dlrPost(jsonRequest({ messageid: '1', status: 'DELIVRD' }));

    const { payload } = recordIfNewMock.mock.calls[0][0];
    expect(payload).not.toHaveProperty('key');
  });
});

describe('TextSMS DLR callback — processing', () => {
  it('records the event under a status-qualified id so later reports for one message still apply', async () => {
    await dlrPost(jsonRequest({ messageid: '900', status: 'DELIVRD' }));

    expect(recordIfNewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'snack-quest',
        provider: 'textsms',
        eventKind: 'sms_dlr',
        providerEventId: '900:DELIVRD',
      }),
    );
    expect(markProcessedMock).toHaveBeenCalledWith('snack-quest', 'textsms', '900:DELIVRD');
  });

  it('short-circuits a redelivered event without re-applying it', async () => {
    recordIfNewMock.mockResolvedValue({ isNew: false });

    const response = await dlrPost(jsonRequest({ messageid: '900', status: 'DELIVRD' }));

    expect(response.status).toBe(200);
    expect(applySmsDeliveryReportMock).not.toHaveBeenCalled();
  });

  it('flags a report for a message this deployment never sent, still acking 200', async () => {
    applySmsDeliveryReportMock.mockResolvedValue({ outcome: 'ignored', outboundMessageId: null });

    const response = await dlrPost(jsonRequest({ messageid: '404', status: 'DELIVRD' }));

    expect(response.status).toBe(200);
    expect(markFailedMock).toHaveBeenCalledWith(
      'snack-quest',
      'textsms',
      '404:DELIVRD',
      expect.stringContaining('404'),
    );
  });

  it('records a matched-but-unactionable status as processed, not failed', async () => {
    applySmsDeliveryReportMock.mockResolvedValue({ outcome: 'ignored', outboundMessageId: 'sms:withdrawal-1' });

    const response = await dlrPost(jsonRequest({ messageid: '900', status: 'ENROUTE' }));

    expect(response.status).toBe(200);
    expect(markProcessedMock).toHaveBeenCalledWith('snack-quest', 'textsms', '900:ENROUTE');
    expect(markFailedMock).not.toHaveBeenCalled();
  });

  /**
   * The likeliest real-world failure, given TextSMS documents no
   * callback payload at all: their field names differ from every alias
   * the parser guesses at. It must ack, touch nothing, and log the raw
   * payload — that log is what turns the first live callback into a fix.
   */
  it('logs the raw payload and changes nothing when no message id is recognisable', async () => {
    const response = await dlrPost(jsonRequest({ some_undocumented_field: 'abc', outcome: 'ok' }));

    expect(response.status).toBe(200);
    expect(recordIfNewMock).not.toHaveBeenCalled();
    expect(applySmsDeliveryReportMock).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('no recognisable message id'),
      expect.stringContaining('some_undocumented_field'),
    );
  });
});
