import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendButtonsMock, verifyStaffSessionFromRequestMock, isSuperAdminMock } = vi.hoisted(() => ({
  sendButtonsMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
  isSuperAdminMock: vi.fn(),
}));

vi.mock('@/lib/integrations/whatchimp/whatchimpGateway', () => ({
  whatchimpGateway: { sendButtons: sendButtonsMock },
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/lib/auth/requireSuperAdmin', () => ({ isSuperAdmin: isSuperAdminMock }));

vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: vi.fn() }));

import { POST as sendTestButtons } from '@/app/api/admin/whatchimp/send-test-buttons/route';

const SESSION = { uid: 'staff-1', email: 's@example.com', displayName: 'S', roles: ['super_admin'], businessId: 'biz-1' };

function call(body: unknown): Promise<Response> {
  return sendTestButtons(
    new Request('http://localhost/api/admin/whatchimp/send-test-buttons', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyStaffSessionFromRequestMock.mockResolvedValue(SESSION);
  isSuperAdminMock.mockReturnValue(true);
});

describe('POST /api/admin/whatchimp/send-test-buttons', () => {
  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    expect((await call({ phone: '254712345678' })).status).toBe(401);
    expect(sendButtonsMock).not.toHaveBeenCalled();
  });

  it('403s a non-super-admin — this sends a real message, so it is the most restricted tier', async () => {
    isSuperAdminMock.mockReturnValue(false);
    expect((await call({ phone: '254712345678' })).status).toBe(403);
    expect(sendButtonsMock).not.toHaveBeenCalled();
  });

  it('400s a phone number too short to be real, before calling the gateway', async () => {
    const response = await call({ phone: '12345' });
    expect(response.status).toBe(400);
    expect(sendButtonsMock).not.toHaveBeenCalled();
  });

  it('sends the two routing buttons and returns the provider message id', async () => {
    sendButtonsMock.mockResolvedValue({ providerMessageId: 'wamid.btn-1' });

    const response = await call({ phone: '254712345678' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      providerMessageId: 'wamid.btn-1',
      error: null,
    });
    expect(sendButtonsMock).toHaveBeenCalledWith({
      businessId: 'biz-1',
      phone: '254712345678',
      bodyText: expect.stringContaining('Snack Quest test'),
      // The ids matter more than the titles: they are what comes back
      // on the inbound webhook and what the engine routes on.
      buttons: [
        { id: 'door', title: 'Door Delivery' },
        { id: 'pickup', title: 'Pickup Station' },
      ],
    });
  });

  it('surfaces WhatChimp’s own failure reason rather than throwing', async () => {
    sendButtonsMock.mockRejectedValue(new Error('Whatchimp /whatsapp/send/interactive-buttons failed: Subscriber not found.'));

    const response = await call({ phone: '254712345678' });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Subscriber not found');
  });
});
