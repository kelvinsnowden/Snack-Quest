import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * A read of every API route in the code (§ ADMIN CAPABILITY PRINCIPLE,
 * § CAPABILITY MATRIX): each exported HTTP method, how it authenticates,
 * which permissions it checks and whether it writes an audit entry. Used by
 * the route-guard test and by `scripts/audit/capabilityMatrix.ts`, so the
 * matrix and the guard read the code the same way. Static text analysis —
 * it finds what the code says, not what it does at runtime.
 */

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export type AuthKind = 'staff' | 'device' | 'machine_api' | 'owner' | 'cron' | 'webhook' | 'customer' | 'creator' | 'session_endpoint' | 'public';

export interface RouteMethod {
  file: string;
  path: string;
  method: HttpMethod;
  auth: AuthKind[];
  permissions: string[];
  audited: boolean;
  /** The first `xxxService.method` or `xxxRepository.method` the method calls. */
  backend: string | null;
}

const AUTH_MARKERS: [AuthKind, RegExp][] = [
  ['staff', /verifyStaffSessionFromRequest|staffWith\(|withPermission\(|getRealStaffSession/],
  ['device', /authenticateDevice\(/],
  ['machine_api', /handleMachineRequest\(|handleIntegrationRequest\(|verifyManufacturerWebhook|authenticateIntegration/],
  ['owner', /verifyPartnerSessionFromRequest/],
  ['cron', /isAuthorizedCronRequest|secretsMatch\(|verifyCronRequest|runCronJob|CRON_SECRET|verifyInternalRequest|internalKey/i],
  ['webhook', /verifyDarajaWebhookRequest|verifyWhatchimpBridgeRequest|verifyTextSmsWebhook|webhookSecret|verifyWebhook/],
  ['customer', /verifyCustomerSession|getCustomerSession|checkoutSession/],
  ['creator', /verifyCreatorSessionFromRequest/],
  ['session_endpoint', /createSessionCookie|SESSION_COOKIE|stringifySetCookie/],
];

const PERMISSION_PATTERNS = [
  /hasPermission\(\s*session\s*,\s*'([a-z_.]+)'/g,
  /forbiddenForPermission\(\s*'([a-z_.]+)'/g,
  /withPermission\(\s*request\s*,\s*'([a-z_.]+)'/g,
];
const PERMISSION_LIST_PATTERNS = [/hasAnyPermission\(\s*session\s*,\s*\[([^\]]+)\]/g, /staffWith\(\s*request\s*,\s*\[([^\]]+)\]/g];

export function listRouteFiles(apiDir: string): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name === 'route.ts') files.push(path);
    }
  };
  walk(apiDir);
  return files.sort();
}

/** Each exported HTTP method's own text, from its `export` to the next top-level `export`. */
export function splitMethods(source: string): { method: HttpMethod; body: string }[] {
  const starts: { method: HttpMethod; index: number }[] = [];
  const pattern = /^export\s+(?:async\s+function\s+|const\s+)(GET|POST|PUT|PATCH|DELETE)\b/gm;
  for (const match of source.matchAll(pattern)) starts.push({ method: match[1] as HttpMethod, index: match.index ?? 0 });
  return starts.map(({ method, index }) => {
    const rest = source.slice(index + 1);
    const next = rest.search(/^export\s/m);
    return { method, body: next === -1 ? source.slice(index) : source.slice(index, index + 1 + next) };
  });
}

/** Permission keys a method checks. A check against a variable (a key chosen from a typed map) is reported as `(chosen at run time)`. */
export function permissionsIn(text: string): string[] {
  const found = new Set<string>();
  if (/hasPermission\(\s*session\s*,\s*[a-zA-Z_][\w.[\]]*\s*\)/.test(text)) found.add('(chosen at run time)');
  for (const pattern of PERMISSION_PATTERNS) for (const match of text.matchAll(pattern)) found.add(match[1]);
  for (const pattern of PERMISSION_LIST_PATTERNS) for (const match of text.matchAll(pattern)) for (const key of match[1].matchAll(/'([a-z_.]+)'/g)) found.add(key[1]);
  return [...found];
}

function authIn(text: string): AuthKind[] {
  return AUTH_MARKERS.filter(([, pattern]) => pattern.test(text)).map(([kind]) => kind);
}

export function readRoutes(root: string): RouteMethod[] {
  const apiDir = join(root, 'app/api');
  const routes: RouteMethod[] = [];
  for (const file of listRouteFiles(apiDir)) {
    const source = readFileSync(file, 'utf8');
    const path = '/api/' + relative(apiDir, file).replace(/\/?route\.ts$/, '');
    const fileAuth = authIn(source);
    for (const { method, body } of splitMethods(source)) {
      const own = authIn(body);
      const backend = body.match(/\b([a-z][A-Za-z]+(?:Service|Repository))\.([a-zA-Z]+)\(/);
      routes.push({
        file: relative(root, file),
        path,
        method,
        // A method that delegates to a helper in the same file takes the file's markers.
        auth: own.length > 0 ? own : fileAuth.length > 0 ? fileAuth : ['public'],
        permissions: permissionsIn(body),
        audited: /recordAuditLog\(/.test(body),
        backend: backend ? `${backend[1]}.${backend[2]}` : null,
      });
    }
  }
  return routes;
}
