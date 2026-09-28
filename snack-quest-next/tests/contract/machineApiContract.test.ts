import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
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
