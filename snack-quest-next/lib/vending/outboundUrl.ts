import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Where Snack Quest may send requests on a manufacturer's behalf.
 *
 * A manufacturer API base URL is configured by staff, but it is still
 * input that makes our servers open connections — the classic SSRF
 * shape. So: https only; no credentials or fragments in the URL; and
 * never a loopback, private, link-local (incl. cloud metadata),
 * carrier-grade-NAT or unique-local address — checked on the literal
 * when the URL is saved and, in production, on the resolved addresses
 * before every use (so a hostname that later resolves inward — DNS
 * rebinding — is refused too).
 *
 * Sandbox integrations outside production may use `http://localhost`
 * so a manufacturer's test server on a developer machine works.
 */

export class UnsafeManufacturerUrlError extends Error {
  constructor(reason: string) {
    super(`Manufacturer API URL refused: ${reason}`);
    this.name = 'UnsafeManufacturerUrlError';
  }
}

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local, cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7));
    return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb') || lower.startsWith('ff');
  }
  return false;
}

function isLinkLocal(host: string): boolean {
  const lower = host.toLowerCase().replace(/^::ffff:/, '');
  if (isIP(lower) === 4) return lower.startsWith('169.254.');
  return isIP(lower) === 6 && /^fe[89ab]/.test(lower);
}

const LOCAL_HOSTNAMES = /^(localhost|localhost\.localdomain)$|\.(localhost|local|internal|intranet|lan|home\.arpa)$/i;

export function validateManufacturerBaseUrl(raw: string, options: { allowLocalHttp: boolean }): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeManufacturerUrlError('not a valid URL');
  }
  if (url.username || url.password) throw new UnsafeManufacturerUrlError('credentials in the URL — use the API key field');
  if (url.hash) throw new UnsafeManufacturerUrlError('fragments are not allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isLinkLocal(host) || /(^|\.)metadata(\.google)?\.internal$/i.test(host)) {
    // Cloud metadata endpoints — never, in any environment.
    throw new UnsafeManufacturerUrlError('link-local and metadata addresses are not allowed');
  }
  const local = LOCAL_HOSTNAMES.test(host) || (isIP(host) !== 0 && isPrivateAddress(host));
  if (options.allowLocalHttp && local && (url.protocol === 'http:' || url.protocol === 'https:')) {
    return url;
  }
  if (url.protocol !== 'https:') throw new UnsafeManufacturerUrlError('https is required');
  if (local) throw new UnsafeManufacturerUrlError('private, loopback and internal addresses are not allowed');
  return url;
}

const resolved = new Map<string, { ok: boolean; expiresAt: number }>();

/** Production-time check that a hostname resolves only to public addresses (cached for a minute). */
export async function assertPublicHost(hostname: string, resolve: (host: string) => Promise<{ address: string }[]> = (host) => lookup(host, { all: true })): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new UnsafeManufacturerUrlError(`${host} is a private address`);
    return;
  }
  const hit = resolved.get(host);
  if (hit && hit.expiresAt > Date.now()) {
    if (!hit.ok) throw new UnsafeManufacturerUrlError(`${host} resolves to a private address`);
    return;
  }
  const addresses = await resolve(host);
  const ok = addresses.length > 0 && addresses.every(({ address }) => !isPrivateAddress(address));
  resolved.set(host, { ok, expiresAt: Date.now() + 60_000 });
  if (!ok) throw new UnsafeManufacturerUrlError(`${host} resolves to a private address`);
}
