import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sessionMock, auditMock } = vi.hoisted(() => ({ sessionMock: vi.fn(), auditMock: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: sessionMock }));
vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: auditMock }));

import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { deviceCredentialRepository, hashDeviceSecret } from '@/repositories/deviceCredentialRepository';
import { GET as listKeys, POST as issueKey } from '@/app/api/vending/machines/[id]/credentials/route';
import { POST as revokeKey } from '@/app/api/vending/machines/[id]/credentials/[credentialId]/revoke/route';

/**
 * A machine's screen keys: issued once, listed without ever exposing a
 * key or its hash, revoked only for the machine they belong to, and
 * replaced all at once when one has leaked.
 */

const BUSINESS_ID = 'biz-device-credential-routes';
const staff = (permissions: string[]) => ({ uid: 'staff-1', email: 's@example.com', displayName: 'S', roles: ['admin'], businessId: BUSINESS_ID, permissions: [], effectivePermissions: permissions });
const KEYS = staff(['machines.view', 'machines.credentials.manage']);
const post = (body: unknown) => new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const revokeCtx = (id: string, credentialId: string) => ({ params: Promise.resolve({ id, credentialId }) });

async function clean() {
  for (const collection of ['machines', 'deviceCredentials']) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
}
beforeEach(async () => {
  vi.clearAllMocks();
  await clean();
});
afterEach(clean);

async function newMachine() {
  return machineService.provisionDevice({ businessId: BUSINESS_ID, serialNumber: 'SN', manufacturer: 'mock', model: 'm', machineCode: `SQ-KEY-${Math.random().toString(36).slice(2, 9)}`, actor: 'staff-1' });
}

describe('screen key routes', () => {
  it('need machines.credentials.manage — seeing machines is not enough', async () => {
    const { machineId, credential } = await newMachine();
    sessionMock.mockResolvedValue(null);
    expect((await listKeys(new Request('http://localhost/x'), ctx(machineId))).status).toBe(401);
    sessionMock.mockResolvedValue(staff(['machines.view']));
    for (const response of [
      await listKeys(new Request('http://localhost/x'), ctx(machineId)),
      await issueKey(post({}), ctx(machineId)),
      await revokeKey(post({ reason: 'x' }), revokeCtx(machineId, credential.credentialId)),
    ]) {
      expect(response.status).toBe(403);
      expect((await response.json()).permission).toBe('machines.credentials.manage');
    }
    expect((await deviceCredentialRepository.listActiveByMachine(BUSINESS_ID, machineId))).toHaveLength(1);
  });

  it('issues a new key once, lists keys without the key or its hash, and never audits the key', async () => {
    const { machineId, credential: first } = await newMachine();
    sessionMock.mockResolvedValue(KEYS);
    const issued = await issueKey(post({}), ctx(machineId));
    expect(issued.status).toBe(201);
    expect(issued.headers.get('Cache-Control')).toBe('no-store');
    const { credential } = await issued.json();
    expect(credential.secret).toMatch(/^[0-9a-f]{64}$/);

    // Without revokeOthers the old key keeps working until someone revokes it.
    expect((await deviceCredentialRepository.listActiveByMachine(BUSINESS_ID, machineId)).map(({ id }) => id).sort()).toEqual([first.credentialId, credential.credentialId].sort());

    const listed = await (await listKeys(new Request('http://localhost/x'), ctx(machineId))).json();
    expect(listed.credentials).toHaveLength(2);
    const serialized = JSON.stringify(listed);
    expect(serialized).not.toContain(credential.secret);
    expect(serialized).not.toContain(hashDeviceSecret(credential.secret));
    expect(serialized).not.toContain(first.secret);
    expect(listed.credentials.map((row: { prefix: string }) => row.prefix)).toContain(credential.secret.slice(0, 8));

    expect(auditMock).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ action: 'issue_device_credential', entityId: credential.credentialId, machineId }));
    expect(JSON.stringify(auditMock.mock.calls)).not.toContain(credential.secret);
  });

  it('replaces every key at once when one has leaked', async () => {
    const { machineId, credential: leaked } = await newMachine();
    sessionMock.mockResolvedValue(KEYS);
    const response = await issueKey(post({ revokeOthers: true, reason: 'Shared by mistake' }), ctx(machineId));
    const body = await response.json();
    expect(body.revokedCredentialIds).toEqual([leaked.credentialId]);
    const active = await deviceCredentialRepository.listActiveByMachine(BUSINESS_ID, machineId);
    expect(active.map(({ id }) => id)).toEqual([body.credential.credentialId]);
    expect((await deviceCredentialRepository.findById(BUSINESS_ID, leaked.credentialId))?.revokedReason).toBe('Shared by mistake');
    expect(auditMock).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ action: 'replace_device_credential' }));
    expect((await issueKey(post({ revokeOthers: 'yes' }), ctx(machineId))).status).toBe(400);
  });

  it('revokes only a key that belongs to this machine, needs a reason, and refuses a second revoke', async () => {
    const a = await newMachine();
    const b = await newMachine();
    sessionMock.mockResolvedValue(KEYS);
    expect((await revokeKey(post({ reason: 'x' }), revokeCtx(a.machineId, b.credential.credentialId))).status).toBe(404);
    expect((await deviceCredentialRepository.findById(BUSINESS_ID, b.credential.credentialId))?.revokedAt).toBeNull();

    expect((await revokeKey(post({ reason: '  ' }), revokeCtx(a.machineId, a.credential.credentialId))).status).toBe(400);
    expect((await revokeKey(post({ reason: 'Tablet replaced' }), revokeCtx(a.machineId, a.credential.credentialId))).status).toBe(200);
    expect((await deviceCredentialRepository.findById(BUSINESS_ID, a.credential.credentialId))?.revokedAt).not.toBeNull();
    expect((await revokeKey(post({ reason: 'again' }), revokeCtx(a.machineId, a.credential.credentialId))).status).toBe(409);
    expect(auditMock).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ action: 'revoke_device_credential', entityId: a.credential.credentialId, after: { revoked: true, reason: 'Tablet replaced' } }));

    // Another business can't reach this machine's keys at all.
    sessionMock.mockResolvedValue({ ...KEYS, businessId: 'someone-else' });
    expect((await listKeys(new Request('http://localhost/x'), ctx(b.machineId))).status).toBe(404);
    expect((await issueKey(post({}), ctx(b.machineId))).status).toBe(404);
    expect((await revokeKey(post({ reason: 'x' }), revokeCtx(b.machineId, b.credential.credentialId))).status).toBe(404);
  });
});
