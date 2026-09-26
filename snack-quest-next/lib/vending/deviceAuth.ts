import 'server-only';

import { timingSafeEqualStrings } from '@/lib/webhooks/webhookSecret';
import { deviceCredentialRepository, hashDeviceSecret } from '@/repositories/deviceCredentialRepository';

/**
 * How a machine gateway authenticates to a Route Handler
 * (§ DEVICE SECURITY, § "the vending machine must never write
 * directly to Firestore").
 *
 * A machine is not a user: no Firebase Auth account, no session
 * cookie, no role. It presents `Authorization: Bearer
 * <machineId>:<secret>` — the id is in the token so authentication is
 * a lookup scoped to that one machine's own active credentials
 * (`listActiveByMachine`), never a fleet-wide scan — and every
 * device-facing route in `app/api/vending/**` calls
 * `authenticateDevice()` before touching anything the request asked
 * for. The secret is hashed and compared with the same
 * constant-time comparison the Daraja/Whatchimp webhook routes
 * already use (`timingSafeEqualStrings`), against
 * `DeviceCredential.secretHash` — never the plaintext, which this
 * codebase never stores in the first place.
 *
 * A revoked credential (`revokedAt` set) is excluded by
 * `listActiveByMachine`'s own query, so revocation is immediate: the
 * very next request with that secret is rejected, with no separate
 * cache or grace window to also invalidate.
 */

export type DeviceAuthResult =
  | { ok: true; businessId: string; machineId: string; credentialId: string }
  | { ok: false; reason: 'missing_header' | 'malformed_token' | 'unknown_machine' | 'invalid_secret' };

const BEARER_PREFIX = 'Bearer ';

function parseBearerToken(header: string | null): { machineId: string; secret: string } | null {
  if (!header || !header.startsWith(BEARER_PREFIX)) {
    return null;
  }
  const token = header.slice(BEARER_PREFIX.length);
  const separatorIndex = token.indexOf(':');
  if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
    return null;
  }
  return {
    machineId: token.slice(0, separatorIndex),
    secret: token.slice(separatorIndex + 1),
  };
}

export async function authenticateDevice(
  request: Request,
  businessId: string,
): Promise<DeviceAuthResult> {
  const header = request.headers.get('authorization');
  const parsed = parseBearerToken(header);
  if (!parsed) {
    return { ok: false, reason: header ? 'malformed_token' : 'missing_header' };
  }

  const active = await deviceCredentialRepository.listActiveByMachine(businessId, parsed.machineId);
  if (active.length === 0) {
    return { ok: false, reason: 'unknown_machine' };
  }

  const presentedHash = hashDeviceSecret(parsed.secret);
  const match = active.find((credential) =>
    timingSafeEqualStrings(presentedHash, credential.data.secretHash),
  );
  if (!match) {
    return { ok: false, reason: 'invalid_secret' };
  }

  await deviceCredentialRepository.recordUse(match.id);
  return { ok: true, businessId, machineId: parsed.machineId, credentialId: match.id };
}

/** The `Authorization` header value a device would actually send — for tests and for whoever provisions a real gateway. */
export function buildDeviceAuthHeader(machineId: string, secret: string): string {
  return `${BEARER_PREFIX}${machineId}:${secret}`;
}
