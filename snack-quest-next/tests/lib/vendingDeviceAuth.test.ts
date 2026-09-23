import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { deviceCredentialRepository, hashDeviceSecret } from '@/repositories/deviceCredentialRepository';
import { authenticateDevice, buildDeviceAuthHeader } from '@/lib/vending/deviceAuth';

/**
 * A machine's identity and secret (§ DEVICE SECURITY) — the
 * foundation every device-facing route in `app/api/vending/**` is
 * built on, so it gets its own test file rather than being proven
 * only incidentally by a route test.
 *
 * The one property that matters most: a device never gets a session
 * cookie or a staff role. It gets a bearer secret scoped to exactly
 * one machine, and the plaintext is never retrievable once issued.
 */

const BUSINESS_ID = 'biz-device-auth-test';
const OTHER_BUSINESS = 'biz-device-auth-other';

function request(header: string | null): Request {
  return new Request('http://localhost/api/vending/telemetry', {
    method: 'POST',
    headers: header ? { authorization: header } : {},
  });
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('deviceCredentials'));
});

describe('issuing a credential', () => {
  it('returns the plaintext secret exactly once, and never stores it', async () => {
    const issued = await deviceCredentialRepository.issue({
      businessId: BUSINESS_ID,
      machineId: 'machine-1',
      issuedBy: 'staff-1',
    });

    expect(issued.secret).toHaveLength(64); // 32 bytes, hex
    expect(issued.machineId).toBe('machine-1');

    const stored = await deviceCredentialRepository.findById(BUSINESS_ID, issued.credentialId);
    expect(stored?.secretHash).toBe(hashDeviceSecret(issued.secret));
    // The stored document has no field anywhere holding the plaintext.
    expect(JSON.stringify(stored)).not.toContain(issued.secret);
  });

  it('records only a short prefix in the clear, not the full secret', async () => {
    const issued = await deviceCredentialRepository.issue({
      businessId: BUSINESS_ID,
      machineId: 'machine-1',
      issuedBy: 'staff-1',
    });
    const stored = await deviceCredentialRepository.findById(BUSINESS_ID, issued.credentialId);
    expect(stored?.secretPrefix).toBe(issued.secret.slice(0, 8));
    expect(stored?.secretPrefix.length).toBeLessThan(issued.secret.length);
  });
});

describe('authenticateDevice', () => {
  it('accepts a valid bearer token for the claimed machine', async () => {
    const issued = await deviceCredentialRepository.issue({
      businessId: BUSINESS_ID,
      machineId: 'machine-1',
      issuedBy: 'staff-1',
    });

    const result = await authenticateDevice(
      request(buildDeviceAuthHeader('machine-1', issued.secret)),
      BUSINESS_ID,
    );

    expect(result).toEqual({
      ok: true,
      businessId: BUSINESS_ID,
      machineId: 'machine-1',
      credentialId: issued.credentialId,
    });
  });

  it('rejects a request with no Authorization header', async () => {
    const result = await authenticateDevice(request(null), BUSINESS_ID);
    expect(result).toEqual({ ok: false, reason: 'missing_header' });
  });

  it('rejects a malformed bearer token', async () => {
    for (const header of ['Bearer ', 'Bearer no-colon-here', 'Basic dXNlcjpwYXNz', 'Bearer machine-1:']) {
      const result = await authenticateDevice(request(header), BUSINESS_ID);
      expect(result.ok).toBe(false);
    }
  });

  it('rejects a machine with no active credential', async () => {
    const result = await authenticateDevice(
      request(buildDeviceAuthHeader('never-provisioned', 'anything')),
      BUSINESS_ID,
    );
    expect(result).toEqual({ ok: false, reason: 'unknown_machine' });
  });

  it('rejects the right machine id with the wrong secret', async () => {
    await deviceCredentialRepository.issue({
      businessId: BUSINESS_ID,
      machineId: 'machine-1',
      issuedBy: 'staff-1',
    });

    const result = await authenticateDevice(
      request(buildDeviceAuthHeader('machine-1', 'a-secret-nobody-issued')),
      BUSINESS_ID,
    );
    expect(result).toEqual({ ok: false, reason: 'invalid_secret' });
  });

  /* One machine's secret must never authenticate as a different machine, even if both are real and active. */
  it('rejects a real secret presented under the wrong machine id', async () => {
    const machineA = await deviceCredentialRepository.issue({
      businessId: BUSINESS_ID,
      machineId: 'machine-a',
      issuedBy: 'staff-1',
    });
    await deviceCredentialRepository.issue({
      businessId: BUSINESS_ID,
      machineId: 'machine-b',
      issuedBy: 'staff-1',
    });

    const result = await authenticateDevice(
      request(buildDeviceAuthHeader('machine-b', machineA.secret)),
      BUSINESS_ID,
    );
    // machine-b has its own active credential, so this fails as a bad
    // secret for machine-b, not as an unrecognised machine.
    expect(result).toEqual({ ok: false, reason: 'invalid_secret' });
  });

  /*
   * Revocation must be immediate — this is the whole point of storing
   * only a hash and checking `revokedAt` at read time rather than
   * caching a "known good" set anywhere.
   */
  it('rejects a revoked credential immediately, even though it was valid a moment ago', async () => {
    const issued = await deviceCredentialRepository.issue({
      businessId: BUSINESS_ID,
      machineId: 'machine-1',
      issuedBy: 'staff-1',
    });

    const before = await authenticateDevice(
      request(buildDeviceAuthHeader('machine-1', issued.secret)),
      BUSINESS_ID,
    );
    expect(before.ok).toBe(true);

    await deviceCredentialRepository.revoke(BUSINESS_ID, issued.credentialId, 'staff-1', 'lost device');

    const after = await authenticateDevice(
      request(buildDeviceAuthHeader('machine-1', issued.secret)),
      BUSINESS_ID,
    );
    expect(after).toEqual({ ok: false, reason: 'unknown_machine' });
  });

  /* A rotation must not lock the machine out between issuing the new secret and the device picking it up. */
  it('accepts both the old and new secret during a rotation window, until the old is revoked', async () => {
    const original = await deviceCredentialRepository.issue({
      businessId: BUSINESS_ID,
      machineId: 'machine-1',
      issuedBy: 'staff-1',
    });
    const rotated = await deviceCredentialRepository.issue({
      businessId: BUSINESS_ID,
      machineId: 'machine-1',
      issuedBy: 'staff-1',
    });

    const withOld = await authenticateDevice(
      request(buildDeviceAuthHeader('machine-1', original.secret)),
      BUSINESS_ID,
    );
    const withNew = await authenticateDevice(
      request(buildDeviceAuthHeader('machine-1', rotated.secret)),
      BUSINESS_ID,
    );
    expect(withOld.ok).toBe(true);
    expect(withNew.ok).toBe(true);

    await deviceCredentialRepository.revoke(BUSINESS_ID, original.credentialId, 'staff-1', 'rotated');

    const oldAfterRevoke = await authenticateDevice(
      request(buildDeviceAuthHeader('machine-1', original.secret)),
      BUSINESS_ID,
    );
    expect(oldAfterRevoke.ok).toBe(false);
  });

  /* A credential issued to one business must never authenticate a request scoped to another. */
  it('never authenticates across a business boundary', async () => {
    const issued = await deviceCredentialRepository.issue({
      businessId: BUSINESS_ID,
      machineId: 'machine-1',
      issuedBy: 'staff-1',
    });

    const result = await authenticateDevice(
      request(buildDeviceAuthHeader('machine-1', issued.secret)),
      OTHER_BUSINESS,
    );
    expect(result).toEqual({ ok: false, reason: 'unknown_machine' });
  });

  it('records when a credential was last used', async () => {
    const issued = await deviceCredentialRepository.issue({
      businessId: BUSINESS_ID,
      machineId: 'machine-1',
      issuedBy: 'staff-1',
    });
    const before = await deviceCredentialRepository.findById(BUSINESS_ID, issued.credentialId);
    expect(before?.lastUsedAt).toBeNull();

    await authenticateDevice(request(buildDeviceAuthHeader('machine-1', issued.secret)), BUSINESS_ID);

    const after = await deviceCredentialRepository.findById(BUSINESS_ID, issued.credentialId);
    expect(after?.lastUsedAt).not.toBeNull();
  });
});
