import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMessageMock, sendButtonsMock, verifyStaffSessionFromRequestMock, isSuperAdminMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
  sendButtonsMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
  isSuperAdminMock: vi.fn(),
}));

vi.mock('@/lib/integrations/whatchimp/whatchimpGateway', () => ({
  whatchimpGateway: { sendMessage: sendMessageMock, sendButtons: sendButtonsMock },
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/lib/auth/requireSuperAdmin', () => ({ isSuperAdmin: isSuperAdminMock }));

vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: vi.fn() }));

import { POST as sendTestMessage } from '@/app/api/admin/whatchimp/send-test-message/route';

const SESSION = { uid: 'staff-1', email: 's@example.com', displayName: 'S', roles: ['super_admin'], businessId: 'biz-1' };

function call(body: unknown): Promise<Response> {
  return sendTestMessage(
    new Request('http://localhost/api/admin/whatchimp/send-test-message', {
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

describe('POST /api/admin/whatchimp/send-test-message', () => {
  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    expect((await call({ phone: '254712345678', kind: 'text' })).status).toBe(401);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('403s a non-super-admin — this sends a real message, so it is the most restricted tier', async () => {
    isSuperAdminMock.mockReturnValue(false);
    expect((await call({ phone: '254712345678', kind: 'text' })).status).toBe(403);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('400s a phone number too short to be real, before calling the gateway', async () => {
    expect((await call({ phone: '12345', kind: 'text' })).status).toBe(400);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('400s an unrecognised kind', async () => {
    expect((await call({ phone: '254712345678', kind: 'carrier-pigeon' })).status).toBe(400);
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(sendButtonsMock).not.toHaveBeenCalled();
  });

  it('sends plain text via the text endpoint, and reports which endpoint was used', async () => {
    sendMessageMock.mockResolvedValue({ providerMessageId: 'wamid.text-1' });

    const response = await call({ phone: '254712345678', kind: 'text' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      kind: 'text',
      endpoint: '/whatsapp/send',
      providerMessageId: 'wamid.text-1',
      error: null,
    });
    expect(sendMessageMock).toHaveBeenCalledWith({
      businessId: 'biz-1',
      phone: '254712345678',
      text: expect.stringContaining('Snack Quest test'),
    });
    expect(sendButtonsMock).not.toHaveBeenCalled();
  });

  it('sends the two routing buttons via the interactive endpoint', async () => {
    sendButtonsMock.mockResolvedValue({ providerMessageId: 'wamid.btn-1' });

    const response = await call({ phone: '254712345678', kind: 'buttons' });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.endpoint).toBe('/whatsapp/send/interactive-buttons');
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
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('surfaces WhatChimp’s own failure reason alongside the endpoint that produced it', async () => {
    sendMessageMock.mockRejectedValue(
      new Error('Whatchimp /whatsapp/send failed: WhatsApp account not found for this phone number id.'),
    );

    const response = await call({ phone: '254712345678', kind: 'text' });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.endpoint).toBe('/whatsapp/send');
    expect(body.error).toContain('WhatsApp account not found');
  });
});
