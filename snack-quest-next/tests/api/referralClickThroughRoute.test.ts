import { beforeEach, describe, expect, it, vi } from 'vitest';

const { recordClickMock, getCurrentBusinessIdMock } = vi.hoisted(() => ({
  recordClickMock: vi.fn(),
  getCurrentBusinessIdMock: vi.fn(),
}));

vi.mock('@/services/referralService', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/referralService')
  >('@/services/referralService');
  return {
    ...actual,
    referralService: { recordClick: recordClickMock },
  };
});

vi.mock('@/lib/business/currentBusinessId', () => ({
  getCurrentBusinessId: getCurrentBusinessIdMock,
}));

import { GET as clickThroughRoute } from '@/app/r/[code]/route';

function request(code: string) {
  return new Request(`http://localhost/r/${code}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentBusinessIdMock.mockReturnValue('biz-1');
});

describe('GET /r/[code]', () => {
  it('redirects to "/" for an unknown or inactive code', async () => {
    recordClickMock.mockResolvedValue(null);

    const response = await clickThroughRoute(request('nope'), {
      params: Promise.resolve({ code: 'nope' }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://localhost/');
  });

  it("redirects to the platform's centralized WhatsApp number with the code pre-filled", async () => {
    recordClickMock.mockResolvedValue({ code: 'SAVE10' });

    const response = await clickThroughRoute(request('save10'), {
      params: Promise.resolve({ code: 'save10' }),
    });

    expect(response.status).toBe(302);
    const location = response.headers.get('location')!;
    expect(location).toMatch(/^https:\/\/wa\.me\/254713157084\?text=/);
    expect(decodeURIComponent(location.split('text=')[1])).toContain('SAVE10');
    expect(recordClickMock).toHaveBeenCalledWith('biz-1', 'save10');
  });
});
