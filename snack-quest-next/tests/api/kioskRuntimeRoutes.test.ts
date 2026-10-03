import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { effectivePermissions } from '@/lib/auth/permissions';
import { machineService } from '@/services/machineService';

/**
 * Service codes and screen reports on the real routes (§ KIOSK SERVICE MODE,
 * § KIOSK OBSERVABILITY): technicians' template may issue codes, marketing
 * may not; a code opens service mode only on its own machine; a screen
 * reports only for itself.
 */

const { verifyStaffSessionFromRequestMock, authenticateDeviceMock, recordAuditLogMock } = vi.hoisted(() => ({ verifyStaffSessionFromRequestMock: vi.fn(), authenticateDeviceMock: vi.fn(), recordAuditLogMock: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock }));
vi.mock('@/lib/vending/deviceAuth', () => ({ authenticateDevice: authenticateDeviceMock }));
vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: recordAuditLogMock }));
vi.mock('@/lib/business/currentBusinessId', () => ({ getCurrentBusinessId: () => 'biz-kiosk-runtime-routes' }));

import { GET as listCodes, POST as issueCode } from '@/app/api/vending/machines/[id]/service-codes/route';
import { POST as openSession } from '@/app/api/vending/machines/[id]/service-session/route';
import { POST as report } from '@/app/api/vending/machines/[id]/kiosk-report/route';

const BUSINESS_ID = 'biz-kiosk-runtime-routes';
function sessionAs(role: 'admin' | 'finance', template: string | null = null) {
  return { uid: `staff-${template ?? role}`, email: 'x@example.com', displayName: 'X', roles: [role], businessId: BUSINESS_ID, permissions: [], effectivePermissions: effectivePermissions({ roles: [role], template }) };
}
const TECHNICIAN = sessionAs('admin', 'machine_operations');
const MARKETING = sessionAs('admin', 'marketing');
const json = (method: string, body?: unknown) => new Request('http://x', { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  vi.clearAllMocks();
  for (const collection of ['machines', 'machineServiceCodes', 'machineServiceAttempts', 'kioskReportBatches', 'kioskDailyStats', 'kioskDeviceStates', 'deviceCredentials']) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
});

async function machine() {
  const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: `SQ-KRR-${Math.random().toString(36).slice(2, 8)}`, serialNumber: 'SN', manufacturer: 'mock', model: 'm', ownerPartnerId: null, actor: 'staff-1' });
  return machineId;
}

describe('service codes', () => {
  it('a technician issues a code (audited, never listed back); marketing can’t', async () => {
    const machineId = await machine();
    verifyStaffSessionFromRequestMock.mockResolvedValue(MARKETING);
    expect((await issueCode(json('POST', { reason: 'x' }), params(machineId))).status).toBe(403);

    verifyStaffSessionFromRequestMock.mockResolvedValue(TECHNICIAN);
    const response = await issueCode(json('POST', { reason: 'Screen frozen' }), params(machineId));
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const { code } = await response.json();
    expect(recordAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'machine.issue_service_code', machineId }));
    expect(JSON.stringify(recordAuditLogMock.mock.calls)).not.toContain(code);
    const listed = await (await listCodes(json('GET'), params(machineId))).json();
    expect(JSON.stringify(listed)).not.toContain(code);
  });

  it('the code opens service mode only on its own machine, once', async () => {
    const machineId = await machine();
    const other = await machine();
    verifyStaffSessionFromRequestMock.mockResolvedValue(TECHNICIAN);
    const { code } = await (await issueCode(json('POST', { reason: 'Check' }), params(machineId))).json();

    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: BUSINESS_ID, machineId: other });
    expect((await openSession(json('POST', { code }), params(other))).status).toBe(403);
    expect((await openSession(json('POST', { code }), params(machineId))).status).toBe(404);

    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: BUSINESS_ID, machineId });
    const opened = await openSession(json('POST', { code }), params(machineId));
    expect(opened.status).toBe(200);
    expect((await opened.json()).sessionExpiresAt).toBeTruthy();
    expect((await openSession(json('POST', { code }), params(machineId))).status).toBe(403);

    authenticateDeviceMock.mockResolvedValue({ ok: false, reason: 'missing_credentials' });
    expect((await openSession(json('POST', { code }), params(machineId))).status).toBe(401);
  });

  it('guessing locks the screen out (429)', async () => {
    const machineId = await machine();
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: BUSINESS_ID, machineId });
    for (let i = 0; i < 5; i += 1) expect((await openSession(json('POST', { code: String(10_000_000 + i) }), params(machineId))).status).toBe(403);
    expect((await openSession(json('POST', { code: '99999999' }), params(machineId))).status).toBe(429);
  });
});

describe('screen reports', () => {
  it('a screen reports for itself only; bad reports are 400', async () => {
    const machineId = await machine();
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: BUSINESS_ID, machineId });
    expect((await report(json('POST', { batchId: 'report-000001', counts: { session_started: 1 } }), params(machineId))).status).toBe(200);
    expect((await report(json('POST', { batchId: 'report-000002', counts: {} }), params('another-machine'))).status).toBe(404);
    expect((await report(json('POST', { counts: {} }), params(machineId))).status).toBe(400);
  });
});
