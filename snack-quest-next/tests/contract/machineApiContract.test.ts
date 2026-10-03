import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import { z } from 'zod';
import { commandStatusSchema, connectSchema, eventsSchema, heartbeatSchema, inventorySchema, statusSchema, DISPENSE_FAILURE_CODES } from '@/lib/vending/v1/schemas';
import { V1_ERROR_CODES } from '@/lib/vending/v1/errorCodes';
import { MACHINE_EVENT_TYPES } from '@/types/machineEvent';
import { PLATFORM_ONLY_EVENT_TYPES } from '@/lib/vending/machineEvents';
import { KEY_ID_PATTERN } from '@/repositories/integrationCredentialRepository';
import { DEFAULT_MACHINE_API_RATE_LIMITS } from '@/lib/vending/v1/rateLimits';

/**
 * Contract sync (§ API readiness). The Machine API is described in five
 * places — the route handlers, the zod request schemas, the OpenAPI
 * document, the narrative specification, and the reference SDKs. Drift
 * between them is how a manufacturer ends up building against something
 * that isn't true. This file fails the build when any two disagree.
 */

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');
const openapi = parse(read('docs/openapi/machine-api-v1.yaml'), { merge: true }) as {
  paths: Record<string, Record<string, { requestBody?: { content: { 'application/json': { schema: { $ref?: string } } } }; parameters?: { $ref?: string; name?: string }[] }>>;
  components: { schemas: Record<string, JsonSchema>; parameters: Record<string, { schema: { pattern?: string } }>; securitySchemes: Record<string, unknown> };
  'x-sq-error-codes': Record<string, { status: number; retry: string }>;
  'x-sq-event-types': string[];
};
const spec = read('docs/SNACK_QUEST_MACHINE_API_V1.md');

interface JsonSchema {
  $ref?: string;
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  oneOf?: JsonSchema[];
  enum?: string[];
  const?: string;
}

const resolve = (schema: JsonSchema): JsonSchema => (schema.$ref ? openapi.components.schemas[schema.$ref.split('/').pop()!] : schema);

/** Every route handler under app/api/v1 as "METHOD /api/v1/…" with {param} path segments. */
function implementedOperations(): string[] {
  const operations: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry === 'route.ts') {
        const route = '/' + path.relative(path.join(ROOT, 'app'), dir).split(path.sep).map((segment) => segment.replace(/^\[(.+)\]$/, '{$1}')).join('/');
        for (const method of readFileSync(full, 'utf8').matchAll(/export (?:async function|const) (GET|POST|PUT|PATCH|DELETE)\b/g)) {
          operations.push(`${method[1]} ${route}`);
        }
      }
    }
  };
  walk(path.join(ROOT, 'app/api/v1'));
  return operations.sort();
}

describe('routes ↔ OpenAPI', () => {
  it('every implemented operation is documented, and every documented one exists', () => {
    const documented = Object.entries(openapi.paths)
      .flatMap(([route, methods]) => Object.keys(methods).filter((method) => ['get', 'post', 'put', 'patch', 'delete'].includes(method)).map((method) => `${method.toUpperCase()} ${route}`))
      .sort();
    expect(documented).toEqual(implementedOperations());
  });

  it('signing is the only authentication documented (device bearer credentials were removed)', () => {
    expect(Object.keys(openapi.components.securitySchemes)).toEqual(['IntegrationSignature']);
    for (const [route, methods] of Object.entries(openapi.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        const names = (operation.parameters ?? []).map((parameter) => parameter.$ref?.split('/').pop() ?? parameter.name);
        expect(names, `${method} ${route}`).toEqual(expect.arrayContaining(['KeyId', 'Timestamp', 'Nonce', 'Signature']));
      }
    }
  });

  it('the documented key id pattern is the one the server enforces', () => {
    expect(openapi.components.parameters.KeyId.schema.pattern).toBe(KEY_ID_PATTERN.source);
  });
});

describe('request schemas ↔ OpenAPI', () => {
  const pairs: [string, z.ZodType, string][] = [
    ['connect', connectSchema, 'ConnectRequest'],
    ['heartbeat', heartbeatSchema, 'HeartbeatRequest'],
    ['status', statusSchema, 'StatusRequest'],
    ['inventory', inventorySchema, 'InventoryRequest'],
    ['events', eventsSchema, 'EventsRequest'],
  ];

  for (const [name, schema, documentedName] of pairs) {
    it(`${name}: same fields, same required fields`, () => {
      const implemented = z.toJSONSchema(schema, { io: 'input' }) as JsonSchema;
      const documented = openapi.components.schemas[documentedName];
      expect(Object.keys(documented.properties ?? {}).sort()).toEqual(Object.keys(implemented.properties ?? {}).sort());
      expect([...(documented.required ?? [])].sort()).toEqual([...(implemented.required ?? [])].sort());
    });
  }

  it('command status: the same statuses, each with the same fields', () => {
    const implemented = (z.toJSONSchema(commandStatusSchema, { io: 'input' }) as JsonSchema).oneOf!;
    const documented = openapi.components.schemas.CommandStatusRequest.oneOf!.map(resolve);
    const byStatus = (branches: JsonSchema[]) =>
      Object.fromEntries(branches.map((branch) => [branch.properties!.status.const ?? branch.properties!.status.enum![0], { fields: Object.keys(branch.properties!).sort(), required: [...(branch.required ?? [])].sort() }]));
    expect(byStatus(documented)).toEqual(byStatus(implemented));
  });

  it('the documented failure codes are the ones the server recognises', () => {
    const failed = openapi.components.schemas.CommandStatusRequest.oneOf!.find((branch) => branch.properties!.status.enum?.[0] === 'failed')!;
    const description = JSON.stringify(failed.properties!.failureCode);
    for (const code of DISPENSE_FAILURE_CODES) {
      expect(description).toContain(code);
    }
  });
});

describe('error codes: implementation ↔ catalogue ↔ OpenAPI ↔ specification', () => {
  /** Every error code literal the v1 code paths can emit. */
  function emittedCodes(): Set<string> {
    const sources = [
      'lib/vending/v1/machineApi.ts',
      'lib/vending/integrationAuth.ts',
      'services/machineApiService.ts',
      'services/manufacturerWebhookService.ts',
      ...implementedOperations().map((operation) => `app${operation.split(' ')[1].replace(/\{(\w+)\}/g, '[$1]')}/route.ts`),
    ];
    const codes = new Set<string>();
    for (const file of new Set(sources)) {
      const source = read(file);
      for (const pattern of [/v1Error\(\s*\d+,\s*'([a-z_]+)'/g, /ContractViolationError\(\s*'([a-z_]+)'/g, /WebhookRejectedError\(\s*\d+,\s*'([a-z_]+)'/g, /code: '([a-z_]+)'/g, /fail\('([a-z_]+)'/g]) {
        for (const match of source.matchAll(pattern)) {
          codes.add(match[1]);
        }
      }
    }
    return codes;
  }

  it('the code emits nothing that is not in the catalogue', () => {
    const catalogue = new Set(Object.keys(V1_ERROR_CODES));
    expect([...emittedCodes()].filter((code) => !catalogue.has(code))).toEqual([]);
  });

  it('OpenAPI documents exactly the catalogue, with the same statuses and retry rules', () => {
    expect(openapi['x-sq-error-codes']).toEqual(Object.fromEntries(Object.entries(V1_ERROR_CODES).map(([code, entry]) => [code, { status: entry.status, retry: entry.retry }])));
  });

  it('the specification explains every code', () => {
    expect(Object.keys(V1_ERROR_CODES).filter((code) => !spec.includes(`\`${code}\``))).toEqual([]);
  });
});

describe('event types', () => {
  it('OpenAPI and the specification list exactly the types a machine may send', () => {
    const external = MACHINE_EVENT_TYPES.filter((type) => !(PLATFORM_ONLY_EVENT_TYPES as readonly string[]).includes(type) && type !== 'UNKNOWN_EVENT');
    expect([...openapi['x-sq-event-types']].sort()).toEqual([...external].sort());
    expect(external.filter((type) => !spec.includes(`\`${type}\``))).toEqual([]);
  });
});

describe('rate limits', () => {
  it('the specification states every default limit', () => {
    const missing = Object.entries(DEFAULT_MACHINE_API_RATE_LIMITS.perMachine).filter(([name, rule]) => !new RegExp(`\`${name}\`[^\\n]*\\b${rule.limit}\\b`).test(spec));
    expect(missing.map(([name]) => name)).toEqual([]);
  });

  it('the specification states every fleet-wide limit', () => {
    const stated = (limit: number) => new RegExp(`\\|[^\\n]*\\|\\s*${limit.toLocaleString('en-US')}\\b`).test(spec);
    const fleetWide = Object.entries(DEFAULT_MACHINE_API_RATE_LIMITS).filter(([name]) => name !== 'perMachine') as [string, number][];
    expect(fleetWide.filter(([, limit]) => !stated(limit)).map(([name]) => name)).toEqual([]);
  });
});

/**
 * Examples are what manufacturers copy. Every one — in the narrative
 * specification and in the OpenAPI document — must be accepted by the
 * server's own request validator, and must match the OpenAPI schema
 * *closed*: an object that lists its properties accepts no others, so an
 * example can't show a field the document doesn't define.
 */
describe('examples', () => {
  const closed = structuredClone(openapi) as unknown as Record<string, unknown>;
  const close = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(close);
    if (node && typeof node === 'object') {
      const record = node as Record<string, unknown>;
      if (record.properties && record.additionalProperties === undefined) record.additionalProperties = false;
      Object.values(record).forEach(close);
    }
  };
  close(closed.components);
  close(closed.paths);
  const ajv = new Ajv({ strict: false, allErrors: true, validateSchema: false });
  addFormats(ajv);
  ajv.addSchema(closed, 'machine-api');
  const pointer = (...segments: string[]) => `machine-api#/${segments.map((segment) => segment.replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`;
  const check = (ref: string, value: unknown): string[] => {
    const validate = ajv.getSchema(ref);
    if (!validate) return [`no schema at ${ref}`];
    return validate(value) ? [] : (validate.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message}${error.params && 'additionalProperty' in error.params ? ` (${String(error.params.additionalProperty)})` : ''}`);
  };
  const componentSchema = (name: string) => pointer('components', 'schemas', name);
  const responseSchema = (route: string, method: string, status: string) => pointer('paths', route, method, 'responses', status, 'content', 'application/json', 'schema');
  const zodFor: Record<string, z.ZodType> = {
    ConnectRequest: connectSchema,
    HeartbeatRequest: heartbeatSchema,
    StatusRequest: statusSchema,
    InventoryRequest: inventorySchema,
    EventsRequest: eventsSchema,
    CommandStatusRequest: commandStatusSchema,
  };
  const checkRequest = (schemaName: string, value: unknown): string[] => {
    const parsed = zodFor[schemaName].safeParse(value);
    return [...(parsed.success ? [] : parsed.error.issues.map((issue) => `server refuses: ${issue.path.join('.')} ${issue.message}`)), ...check(componentSchema(schemaName), value)];
  };

  /** Where each specification section's examples belong. */
  const SECTIONS: { heading: RegExp; request?: string; response?: string }[] = [
    { heading: /^### 4\.1 /, response: componentSchema('Error') },
    { heading: /^### 5\.1 /, request: 'ConnectRequest' },
    { heading: /^### 5\.2 /, response: responseSchema('/api/v1/machines/{machineCode}', 'get', '200') },
    { heading: /^### 5\.3 /, request: 'HeartbeatRequest', response: responseSchema('/api/v1/machines/{machineCode}/heartbeat', 'post', '202') },
    { heading: /^### 5\.4 /, request: 'StatusRequest' },
    { heading: /^### 5\.5 /, request: 'InventoryRequest', response: responseSchema('/api/v1/machines/{machineCode}/inventory', 'post', '200') },
    { heading: /^### 5\.6 /, request: 'EventsRequest', response: responseSchema('/api/v1/machines/{machineCode}/events', 'post', '202') },
    { heading: /^### 6\.1 /, response: responseSchema('/api/v1/machines/{machineCode}/commands', 'get', '200') },
    { heading: /^### 6\.3 /, request: 'CommandStatusRequest' },
    { heading: /^## 8\. /, response: responseSchema('/api/v1/webhooks/manufacturers/{slug}', 'post', '202') },
  ];

  function specExamples(): { heading: string; line: number; text: string }[] {
    const lines = spec.split('\n');
    const found: { heading: string; line: number; text: string }[] = [];
    let heading = '';
    for (let index = 0; index < lines.length; index += 1) {
      if (/^#{2,3} /.test(lines[index])) heading = lines[index];
      if (lines[index] === '```json') {
        const line = index + 1;
        const body: string[] = [];
        while (lines[++index] !== '```') body.push(lines[index]);
        found.push({ heading, line, text: body.join('\n') });
      }
    }
    return found;
  }

  it('every JSON example in the specification is valid for its endpoint', () => {
    const examples = specExamples();
    expect(examples.length).toBeGreaterThanOrEqual(17);
    const problems: string[] = [];
    let checked = 0;
    for (const { heading, line, text } of examples) {
      if (text.includes('…')) {
        // Only the schematic envelope in §4.1 may elide.
        if (!/^### 4\.1 /.test(heading)) problems.push(`line ${line}: elided example outside §4.1`);
        continue;
      }
      let value: Record<string, unknown>;
      try {
        value = JSON.parse(text) as Record<string, unknown>;
      } catch (error) {
        problems.push(`line ${line}: not JSON (${error instanceof Error ? error.message : String(error)})`);
        continue;
      }
      const section = SECTIONS.find((candidate) => candidate.heading.test(heading));
      const isResponse = 'data' in value || 'error' in value;
      const target = isResponse ? section?.response : section?.request;
      if (!target) {
        problems.push(`line ${line}: no ${isResponse ? 'response' : 'request'} schema known for "${heading}"`);
        continue;
      }
      problems.push(...(isResponse ? check(target, value) : checkRequest(target, value)).map((problem) => `line ${line} (${heading}): ${problem}`));
      checked += 1;
    }
    expect(problems).toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(16);
  });

  it('every request example in the OpenAPI document is accepted by the server', () => {
    const problems: string[] = [];
    let checked = 0;
    for (const [route, methods] of Object.entries(openapi.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        const content = (operation.requestBody?.content['application/json'] ?? null) as { schema: { $ref?: string }; example?: unknown; examples?: Record<string, { value: unknown }> } | null;
        const schemaName = content?.schema.$ref?.split('/').pop();
        if (!content || !schemaName) continue;
        const examples = [...(content.example === undefined ? [] : [content.example]), ...Object.values(content.examples ?? {}).map((example) => example.value)];
        if (examples.length === 0) problems.push(`${method.toUpperCase()} ${route}: no request example`);
        for (const example of examples) {
          problems.push(...checkRequest(schemaName, example).map((problem) => `${method.toUpperCase()} ${route}: ${problem}`));
          checked += 1;
        }
      }
    }
    expect(problems).toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(9);
  });

  it('every field-level example matches its own schema', () => {
    const problems: string[] = [];
    const walk = (node: unknown, at: string[]): void => {
      if (Array.isArray(node)) return node.forEach((item, index) => walk(item, [...at, String(index)]));
      if (!node || typeof node !== 'object') return;
      const record = node as Record<string, unknown>;
      if ('example' in record && ('type' in record || '$ref' in record) && !at.includes('content')) {
        const { example, ...schema } = record;
        const validate = ajv.compile({ ...schema, $id: `field:${at.join('/')}` });
        if (!validate(example)) problems.push(`${at.join('.')}: ${JSON.stringify(example)} ${ajv.errorsText(validate.errors)}`);
      }
      for (const [key, value] of Object.entries(record)) walk(value, [...at, key]);
    };
    walk(openapi.components, ['components']);
    walk(openapi.paths, ['paths']);
    expect(problems).toEqual([]);
  });
});

describe('reference SDKs ↔ OpenAPI', () => {
  it('every path the SDKs call is a documented operation', () => {
    const documented = Object.keys(openapi.paths);
    const toTemplate = (relative: string) =>
      relative === '' ? '/api/v1/machines/{machineCode}' : `/api/v1/machines/{machineCode}/${relative.replace(/\$\{[^}]+\}|%s/g, '{commandId}')}`;
    const ts = read('sdk/typescript/snackQuestMachine.ts');
    const py = read('sdk/python/snack_quest_machine.py');
    const called = [
      ...[...ts.matchAll(/this\.machinePath\(machineCode, [`'"]([^`'"]*)[`'"]\)/g)].map((match) => toTemplate(match[1])),
      ...[...py.matchAll(/self\._path\(machine_code, "([^"]+)"(?: % [^)]+)?\)/g)].map((match) => toTemplate(match[1])),
      '/api/v1/machines/connect',
    ];
    expect(called.length).toBeGreaterThan(10);
    expect([...new Set(called)].filter((route) => !documented.includes(route))).toEqual([]);
  });
});
