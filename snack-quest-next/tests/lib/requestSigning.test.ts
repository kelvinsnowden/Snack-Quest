import { describe, expect, it } from 'vitest';
import { canonicalRequest, computeSignature, sha256Hex, signRequest, signatureMatches, SIGNING_HEADERS } from '@/lib/vending/requestSigning';

const SECRET = 'sqs_test_secret_value';

function verify(headers: Record<string, string>, method: string, path: string, body: string): boolean {
  const expected = computeSignature(
    SECRET,
    canonicalRequest({ timestamp: headers[SIGNING_HEADERS.timestamp], nonce: headers[SIGNING_HEADERS.nonce], method, pathWithQuery: path, body }),
  );
  return signatureMatches(headers[SIGNING_HEADERS.signature], expected);
}

describe('request signing v1', () => {
  it('produces all four headers, with a versioned signature', () => {
    const headers = signRequest({ keyId: 'sqk_test_abc', secret: SECRET, method: 'post', pathWithQuery: '/api/v1/machines/SQ-MCH-000001/heartbeat', body: '{}' });
    expect(Object.keys(headers).sort()).toEqual([SIGNING_HEADERS.keyId, SIGNING_HEADERS.nonce, SIGNING_HEADERS.signature, SIGNING_HEADERS.timestamp].sort());
    expect(headers[SIGNING_HEADERS.signature]).toMatch(/^v1=[0-9a-f]{64}$/);
  });

  it('verifies the exact request it signed', () => {
    const body = JSON.stringify({ eventId: 'hb-1' });
    const headers = signRequest({ keyId: 'k', secret: SECRET, method: 'POST', pathWithQuery: '/p', body });
    expect(verify(headers, 'POST', '/p', body)).toBe(true);
  });

  it('fails if the body, path, method or secret differ by anything', () => {
    const body = '{"quantity":1}';
    const headers = signRequest({ keyId: 'k', secret: SECRET, method: 'POST', pathWithQuery: '/p?a=1', body });
    expect(verify(headers, 'POST', '/p?a=1', '{"quantity":2}')).toBe(false);
    expect(verify(headers, 'POST', '/p?a=2', body)).toBe(false);
    expect(verify(headers, 'PUT', '/p?a=1', body)).toBe(false);
    const other = computeSignature('another-secret', canonicalRequest({ timestamp: headers[SIGNING_HEADERS.timestamp], nonce: headers[SIGNING_HEADERS.nonce], method: 'POST', pathWithQuery: '/p?a=1', body }));
    expect(signatureMatches(headers[SIGNING_HEADERS.signature], other)).toBe(false);
  });

  it('rejects an unversioned or malformed signature header', () => {
    const expected = computeSignature(SECRET, 'x');
    expect(signatureMatches(expected, expected)).toBe(false);
    expect(signatureMatches('v1=short', expected)).toBe(false);
  });

  it('pins the canonical form (manufacturers implement this byte for byte)', () => {
    expect(canonicalRequest({ timestamp: '1790000000', nonce: 'n0nce-n0nce-n0nce', method: 'post', pathWithQuery: '/api/v1/x', body: '' })).toBe(
      ['v1', '1790000000', 'n0nce-n0nce-n0nce', 'POST', '/api/v1/x', sha256Hex('')].join('\n'),
    );
    // Known SHA-256 of the empty string — guards against an accidental encoding change.
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('matches the published test vector in docs/SNACK_QUEST_MACHINE_API_V1.md §3.3 exactly', () => {
    // If this fails, either the server changed or the document is wrong — manufacturers build against the document.
    const headers = signRequest({
      keyId: 'sqk_test_example',
      secret: 'sqs_example_secret_do_not_use_0000000000000000',
      method: 'POST',
      pathWithQuery: '/api/v1/machines/SQ-MCH-000001/heartbeat',
      body: '{"eventId":"hb-20260927-0001","uptimeSeconds":86400}',
      timestamp: 1790500000,
      nonce: 'Q2xhdWRlU2lnbmluZ05vbmNl',
    });
    expect(sha256Hex('{"eventId":"hb-20260927-0001","uptimeSeconds":86400}')).toBe('084a5ffcb9cc2c468810ed359b15ded2b4f8c6a6c7d77ebbc2918cf2b33f55a3');
    expect(headers[SIGNING_HEADERS.signature]).toBe('v1=ad94a5230dfeb4e4aeef9e6bf265f35cdb9397b0f2b9bcf91aa8eb92cafed4ca');
  });
});
