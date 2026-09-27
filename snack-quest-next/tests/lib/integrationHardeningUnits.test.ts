import { describe, expect, it } from 'vitest';
import { redact, redactString } from '@/lib/observability/redact';
import { captureLogs, logger } from '@/lib/observability/logger';
import { FallbackRateLimitStore, KvRateLimitStore, MemoryRateLimitStore, RateLimiter } from '@/lib/rateLimit/rateLimiter';
import { UpstashRestClient, KvUnavailableError, type KvClient } from '@/lib/kv/upstashRestClient';
import { credentialStatus, secretFingerprint, shouldRecordUse } from '@/lib/vending/credentialLifecycle';
import { classifyNetworkError, recoveryFor, RECOVERY_POLICY } from '@/lib/vending/integrationErrors';
import { DEFAULT_MACHINE_API_RATE_LIMITS, machineApiRateLimits } from '@/lib/vending/v1/rateLimits';

const ts = (ms: number) => ({ toMillis: () => ms }) as never;

describe('log redaction', () => {
  const secret = 'sqs_' + 'Z'.repeat(43);

  it('masks credential-shaped values anywhere in free text', () => {
    const text = `failed with ${secret}, Bearer abc.def.ghi, v1=${'a'.repeat(64)} and enc:v1:QUJDRA==`;
    const out = redactString(text);
    expect(out).not.toContain(secret);
    expect(out).not.toContain('abc.def.ghi');
    expect(out).not.toContain('a'.repeat(64));
    expect(out).not.toContain('QUJDRA==');
  });

  it('masks credential-named fields whatever their value, and keeps key ids visible', () => {
    const out = redact({ keyId: 'sqk_test_abc12345', secret: 'anything', authorization: 'x', 'x-sq-signature': 'y', nested: { apiKey: 'z', password: 'p' }, secretEncrypted: 'e' }) as Record<string, unknown>;
    expect(out.keyId).toBe('sqk_test_abc12345');
    expect(out.secret).toBe('[REDACTED]');
    expect(out.authorization).toBe('[REDACTED]');
    expect(out['x-sq-signature']).toBe('[REDACTED]');
    expect(out.secretEncrypted).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).apiKey).toBe('[REDACTED]');
  });

  it('flattens Headers so an Authorization header is caught by name', () => {
    const headers = new Headers({ authorization: 'Bearer secret-token', 'x-sq-key-id': 'sqk_test_abc12345' });
    const out = redact({ headers }) as { headers: Record<string, string> };
    expect(out.headers.authorization).toBe('[REDACTED]');
    expect(out.headers['x-sq-key-id']).toBe('sqk_test_abc12345');
  });

  it('errors are reduced to name + redacted message; the logger cannot bypass redaction', () => {
    const logs = captureLogs();
    try {
      logger.error('oops', { error: new Error(`leaked ${secret}`), body: { secret } });
      const line = JSON.stringify(logs.entries);
      expect(line).not.toContain(secret);
      expect(logs.entries[0].msg).toBe('oops');
    } finally {
      logs.restore();
    }
  });
});

describe('rate limiter', () => {
  it('fixed window: allows up to the limit, refuses beyond, resets next window', async () => {
    const limiter = new RateLimiter(new MemoryRateLimitStore());
    const rule = { name: 'r', limit: 3, windowSeconds: 60 };
    const t0 = 1_800_000_000_000;
    for (let i = 0; i < 3; i += 1) {
      expect((await limiter.check([{ key: 'k', rule }], t0)).allowed).toBe(true);
    }
    const denied = await limiter.check([{ key: 'k', rule }], t0);
    expect(denied.allowed).toBe(false);
    expect(denied.resetSeconds).toBeGreaterThan(0);
    expect((await limiter.check([{ key: 'k', rule }], t0 + 60_000)).allowed).toBe(true);
  });

  it('reports the rule that was exceeded when several apply', async () => {
    const limiter = new RateLimiter(new MemoryRateLimitStore());
    const tight = { name: 'tight', limit: 1, windowSeconds: 60 };
    const loose = { name: 'loose', limit: 100, windowSeconds: 60 };
    await limiter.check([{ key: 'a', rule: tight }, { key: 'b', rule: loose }]);
    const decision = await limiter.check([{ key: 'a', rule: tight }, { key: 'b', rule: loose }]);
    expect(decision.allowed).toBe(false);
    expect(decision.rule.name).toBe('tight');
  });

  it('shared store uses INCRBY + EXPIRE on a per-window key', async () => {
    const calls: unknown[][] = [];
    const kv: KvClient = { pipeline: async (commands) => { calls.push(commands); return [7, 1]; } };
    const store = new KvRateLimitStore(kv);
    const { count } = await store.hit('m:x:heartbeat', 2, 60, 1_800_000_000_000);
    expect(count).toBe(7);
    expect(calls[0]).toEqual([['INCRBY', 'rl:m:x:heartbeat@1800000000', 2], ['EXPIRE', 'rl:m:x:heartbeat@1800000000', 65]]);
  });

  it('a Redis outage degrades to per-instance counting, never to an error', async () => {
    const broken: KvClient = { pipeline: async () => { throw new KvUnavailableError('down'); } };
    const logs = captureLogs();
    try {
      const limiter = new RateLimiter(new FallbackRateLimitStore(new KvRateLimitStore(broken), new MemoryRateLimitStore()));
      const decision = await limiter.check([{ key: 'k', rule: { name: 'r', limit: 5, windowSeconds: 60 } }]);
      expect(decision.allowed).toBe(true);
      expect(logs.entries.some((entry) => entry.level === 'warn')).toBe(true);
    } finally {
      logs.restore();
    }
  });

  it('the REST client surfaces HTTP and per-command errors as KvUnavailableError', async () => {
    const httpError = new UpstashRestClient('https://kv.example', 'token', async () => new Response('nope', { status: 500 }));
    await expect(httpError.pipeline([['GET', 'k']])).rejects.toBeInstanceOf(KvUnavailableError);
    const commandError = new UpstashRestClient('https://kv.example', 'token', async () => Response.json([{ error: 'WRONGTYPE' }]));
    await expect(commandError.pipeline([['GET', 'k']])).rejects.toBeInstanceOf(KvUnavailableError);
    const ok = new UpstashRestClient('https://kv.example', 'token', async (_url, init) => {
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer token');
      return Response.json([{ result: 'OK' }]);
    });
    expect(await ok.pipeline([['SET', 'k', '1']])).toEqual(['OK']);
  });

  it('configuration overrides merge with defaults and invalid overrides are ignored', () => {
    const previous = process.env.MACHINE_API_RATE_LIMITS;
    try {
      process.env.MACHINE_API_RATE_LIMITS = JSON.stringify({ perMachine: { heartbeat: { limit: 99, windowSeconds: 60 }, bogus: { limit: 1, windowSeconds: 1 } }, perCredentialPerMinute: 5 });
      const limits = machineApiRateLimits();
      expect(limits.perMachine.heartbeat.limit).toBe(99);
      expect(limits.perMachine.command_poll).toEqual(DEFAULT_MACHINE_API_RATE_LIMITS.perMachine.command_poll);
      expect(limits.perCredentialPerMinute).toBe(5);
      process.env.MACHINE_API_RATE_LIMITS = '{not json';
      expect(machineApiRateLimits()).toEqual(DEFAULT_MACHINE_API_RATE_LIMITS);
    } finally {
      if (previous === undefined) delete process.env.MACHINE_API_RATE_LIMITS;
      else process.env.MACHINE_API_RATE_LIMITS = previous;
    }
  });
});

describe('credential lifecycle derivation', () => {
  const now = new Date('2026-09-27T12:00:00Z');
  const base = { revokedAt: null, expiresAt: null, lastUsedAt: null, graceEndsAt: null, supersededAt: null };

  it('issued → active → rotating → expired, and revoked always wins', () => {
    expect(credentialStatus(base, now)).toBe('issued');
    expect(credentialStatus({ ...base, lastUsedAt: ts(now.getTime() - 1000) }, now)).toBe('active');
    expect(credentialStatus({ ...base, supersededAt: ts(now.getTime() - 1000), graceEndsAt: ts(now.getTime() + 1000) }, now)).toBe('rotating');
    expect(credentialStatus({ ...base, supersededAt: ts(now.getTime() - 1000), graceEndsAt: ts(now.getTime() - 1) }, now)).toBe('expired');
    expect(credentialStatus({ ...base, expiresAt: ts(now.getTime()) }, now)).toBe('expired');
    expect(credentialStatus({ ...base, revokedAt: ts(0), supersededAt: ts(0), graceEndsAt: ts(now.getTime() + 1) }, now)).toBe('revoked');
  });

  it('fingerprints reveal nothing usable and lastUsedAt writes are throttled', () => {
    const fp = secretFingerprint('sqs_abc');
    expect(fp).toMatch(/^[0-9a-f]{12}$/);
    expect(fp).not.toContain('abc');
    expect(shouldRecordUse({ lastUsedAt: null }, now)).toBe(true);
    expect(shouldRecordUse({ lastUsedAt: ts(now.getTime() - 30_000) }, now)).toBe(false);
    expect(shouldRecordUse({ lastUsedAt: ts(now.getTime() - 61_000) }, now)).toBe(true);
  });
});

describe('error taxonomy', () => {
  it('classifies transport failures by whether the request could have been delivered', () => {
    const withCause = (code: string) => Object.assign(new TypeError('fetch failed'), { cause: { code } });
    expect(classifyNetworkError(withCause('ENOTFOUND'))).toBe('transport.dns');
    expect(classifyNetworkError(withCause('ECONNREFUSED'))).toBe('transport.connection_refused');
    expect(classifyNetworkError(withCause('CERT_HAS_EXPIRED'))).toBe('transport.tls');
    expect(classifyNetworkError(withCause('ECONNRESET'))).toBe('transport.connection_reset');
    expect(classifyNetworkError(new Error('something odd'))).toBe('transport.connection_reset');
    expect(recoveryFor('transport.dns').delivered).toBe('no');
    expect(recoveryFor('transport.tls').delivered).toBe('no');
    expect(recoveryFor('transport.connection_reset').delivered).toBe('maybe');
    expect(recoveryFor('transport.timeout').delivered).toBe('maybe');
  });

  it('never allows an automatic refund or retry for anything that may have been delivered', () => {
    for (const [code, policy] of Object.entries(RECOVERY_POLICY)) {
      if (policy.delivered === 'maybe') {
        expect({ code, refundSafe: policy.refundSafe, retrySafe: policy.retrySafe }).toEqual({ code, refundSafe: false, retrySafe: false });
      }
    }
    expect(recoveryFor('unknown.outcome_undetermined').delivered).toBe('maybe');
    expect(recoveryFor('protocol.malformed_response').delivered).toBe('maybe');
  });
});
