import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSetCookie } from 'cookie';

const { recordMock, getCurrentBusinessIdMock } = vi.hoisted(() => ({
  recordMock: vi.fn(),
  getCurrentBusinessIdMock: vi.fn(),
}));

vi.mock('@/services/pageViewService', async () => {
  const actual = await vi.importActual<typeof import('@/services/pageViewService')>('@/services/pageViewService');
  return {
    ...actual,
    pageViewService: { record: recordMock },
  };
});

vi.mock('@/lib/business/currentBusinessId', () => ({
  getCurrentBusinessId: getCurrentBusinessIdMock,
}));

import { POST as trackRoute } from '@/app/api/analytics/track/route';
import { PageViewValidationError } from '@/services/pageViewService';

function request(body: unknown, cookie?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie) {
    headers.cookie = cookie;
  }
  return new Request('http://localhost/api/analytics/track', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentBusinessIdMock.mockReturnValue('biz-1');
  recordMock.mockResolvedValue(undefined);
});

describe('POST /api/analytics/track', () => {
  it('issues a new httpOnly visitor cookie on a first visit and records against it', async () => {
    const response = await trackRoute(request({ path: '/', referrer: null }));

    expect(response.status).toBe(204);
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    const parsed = parseSetCookie(setCookie as string);
    expect(parsed.name).toBe('sq_visitor');
    expect(parsed.httpOnly).toBe(true);
    expect(recordMock).toHaveBeenCalledWith('biz-1', {
      path: '/',
      visitorId: parsed.value,
      referrer: null,
    });
  });

  it('reuses an existing visitor id and does not re-set the cookie', async () => {
    const response = await trackRoute(request({ path: '/boxes', referrer: null }, 'sq_visitor=known-visitor'));

    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(recordMock).toHaveBeenCalledWith('biz-1', {
      path: '/boxes',
      visitorId: 'known-visitor',
      referrer: null,
    });
  });

  it('passes through a same-origin referrer string', async () => {
    await trackRoute(request({ path: '/boxes', referrer: 'https://snackquests.shop/' }, 'sq_visitor=known-visitor'));

    expect(recordMock).toHaveBeenCalledWith('biz-1', {
      path: '/boxes',
      visitorId: 'known-visitor',
      referrer: 'https://snackquests.shop/',
    });
  });

  it('rejects a body with no path', async () => {
    const response = await trackRoute(request({ referrer: null }));
    expect(response.status).toBe(400);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON rather than throwing', async () => {
    const response = await trackRoute(
      new Request('http://localhost/api/analytics/track', { method: 'POST', body: 'not json' }),
    );
    expect(response.status).toBe(400);
  });

  it('surfaces a validation error from the service as a 400, not a 500', async () => {
    recordMock.mockRejectedValue(new PageViewValidationError('bad path'));
    const response = await trackRoute(request({ path: 'not-a-path', referrer: null }));
    expect(response.status).toBe(400);
  });
});
