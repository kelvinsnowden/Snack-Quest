/**
 * Log redaction. Everything the integration layer logs passes through
 * `redact` first, so a secret can only reach the logs if it is hidden
 * inside a field name *and* a value shape this module doesn't know —
 * and the tests in tests/lib/redact.test.ts pin every shape we issue.
 *
 * Two independent nets:
 *
 * 1. **By key.** Any field whose name looks like it holds a credential
 *    (`secret`, `authorization`, `signature`, `password`, `token`,
 *    `apiKey`, `cookie`, …) is replaced wholesale, whatever its value.
 * 2. **By value.** Strings are scanned for the credential shapes this
 *    platform issues or handles — Snack Quest signing secrets (`sqs_…`),
 *    encrypted-at-rest values (`enc:v1:…`), bearer tokens, `v1=` HMAC
 *    signatures, PEM private keys — and those substrings are masked
 *    even inside free text such as an error message.
 *
 * Key ids (`sqk_…`) are *not* secret and stay visible: they are what an
 * operator needs to find which credential a request used.
 */

const REDACTED = '[REDACTED]';

const SENSITIVE_KEY = /(secret|passw(or)?d|authorization|signature|token|api[-_]?key|cookie|credential(?!Id)|private[-_]?key|x-sq-signature|x-sq-nonce)/i;

const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /sqs_[A-Za-z0-9_-]{8,}/g,
  /enc:v1:[A-Za-z0-9+/=]+/g,
  /\bBearer\s+[^\s"',]+/gi,
  /\bv1=[0-9a-fA-F]{64}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

const MAX_DEPTH = 6;
const MAX_STRING = 2_000;

export function redactString(value: string): string {
  let out = value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value;
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (depth >= MAX_DEPTH) {
    return '[depth-limit]';
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redact(item, depth + 1));
  }
  if (typeof value === 'object') {
    // Headers-like objects are flattened so their credentials are caught by key.
    if (typeof (value as { forEach?: unknown }).forEach === 'function' && typeof (value as { get?: unknown }).get === 'function' && !(value instanceof Map)) {
      const flat: Record<string, unknown> = {};
      (value as Headers).forEach((headerValue, headerName) => {
        flat[headerName] = headerValue;
      });
      return redact(flat, depth);
    }
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(inner, depth + 1);
    }
    return out;
  }
  return String(value);
}
