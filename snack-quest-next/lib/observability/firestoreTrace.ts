import 'server-only';

import { appendFileSync } from 'node:fs';

/**
 * Counts and times every Firestore round trip the server makes, without
 * changing what any call returns.
 *
 * Two uses:
 *
 * - **Always on (production):** an operation that takes longer than
 *   `FIRESTORE_SLOW_MS` (default 1500 ms) or reads more than
 *   `FIRESTORE_LARGE_READ_DOCS` (default 1000) documents is logged as one
 *   structured `firestore.slow` line — collection and size only, never
 *   document ids or contents. That is the slow-query diagnostic.
 * - **Measurement (`PERF_TRACE_FILE` set):** every operation is appended
 *   to that file as JSON lines, which `scripts/perf/measurePages.mjs`
 *   slices per page load to count reads and sequential round trips.
 *
 * It wraps the public read and commit methods of the Admin SDK's classes
 * once, at server start (`instrumentation.ts`). The wrapper returns the
 * SDK's own promise untouched; timing hangs off a side branch that
 * swallows its own errors, so the tracer can never change a result,
 * throw, or turn a rejection into an unhandled one.
 */

export interface FirestoreOp {
  /** `query`, `get` (documents by reference), `count`, `txn-get`, `txn-getAll` or `commit`. */
  kind: string;
  /** Collection id(s) touched, e.g. `machines` or `users,staffProfiles`. */
  target: string;
  /** Documents returned (reads billed), or writes in a commit. */
  docs: number;
  /** Wall-clock start, ms since epoch. */
  start: number;
  ms: number;
  ok: boolean;
}

type Sink = (op: FirestoreOp) => void;

const INSTALLED = Symbol.for('snackQuest.firestoreTrace');

function collectionOf(path: string | undefined): string {
  if (!path) return '?';
  const segments = path.split('/');
  // collection/doc/subcollection/doc → the last collection segment.
  return segments.length % 2 === 0 ? (segments.at(-2) ?? '?') : (segments.at(-1) ?? '?');
}

function queryTarget(query: unknown): string {
  try {
    const options = (query as { _queryOptions?: { collectionId?: string; allDescendants?: boolean } })._queryOptions;
    if (options?.collectionId) return options.allDescendants ? `${options.collectionId}(group)` : options.collectionId;
  } catch {
    // Internal shape changed: fall through.
  }
  return '?';
}

function refsTarget(args: unknown[]): string {
  const names = new Set<string>();
  for (const arg of args) {
    const path = (arg as { path?: string } | null)?.path;
    if (typeof path === 'string') names.add(collectionOf(path));
  }
  return [...names].join(',') || '?';
}

function sizeOf(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  const size = (result as { size?: number } | null)?.size;
  if (typeof size === 'number') return size;
  if (result && typeof (result as { exists?: unknown }).exists === 'boolean') return 1;
  return 0;
}

function wrap(owner: Record<string, unknown>, name: string, kind: string, target: (self: unknown, args: unknown[]) => string, docs: (result: unknown, self: unknown) => number, sink: Sink) {
  const original = owner[name];
  if (typeof original !== 'function') return;
  owner[name] = function traced(this: unknown, ...args: unknown[]) {
    const start = Date.now();
    const result = (original as (...a: unknown[]) => unknown).apply(this, args);
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      (result as Promise<unknown>).then(
        (value) => {
          try {
            sink({ kind, target: target(this, args), docs: docs(value, this), start, ms: Date.now() - start, ok: true });
          } catch {
            // Never let tracing affect the caller.
          }
        },
        () => {
          try {
            sink({ kind, target: target(this, args), docs: 0, start, ms: Date.now() - start, ok: false });
          } catch {
            // Never let tracing affect the caller.
          }
        },
      );
    }
    return result;
  };
}

function defaultSink(): Sink {
  const file = process.env.PERF_TRACE_FILE;
  const slowMs = Number(process.env.FIRESTORE_SLOW_MS) || 1500;
  const largeDocs = Number(process.env.FIRESTORE_LARGE_READ_DOCS) || 1000;
  return (op) => {
    if (file) appendFileSync(file, `${JSON.stringify(op)}\n`);
    if (op.ms >= slowMs || op.docs >= largeDocs) {
      console.warn(JSON.stringify({ event: 'firestore.slow', kind: op.kind, target: op.target, docs: op.docs, ms: op.ms, ok: op.ok }));
    }
  };
}

/** Installs the tracer once per process. Safe to call more than once. */
export function installFirestoreTrace(firestoreModule: Record<string, unknown>, sink: Sink = defaultSink()): void {
  const registry = globalThis as Record<symbol, unknown>;
  if (registry[INSTALLED]) return;
  registry[INSTALLED] = true;

  const proto = (name: string) => (firestoreModule[name] as { prototype?: Record<string, unknown> } | undefined)?.prototype;
  const query = proto('Query');
  const firestore = proto('Firestore');
  const transaction = proto('Transaction');
  const batch = proto('WriteBatch');

  // `DocumentReference.get()` goes through `Firestore.getAll()`, so wrapping
  // `getAll` counts single-document reads once, not twice.
  if (firestore) wrap(firestore, 'getAll', 'get', (_self, args) => refsTarget(args), (result) => sizeOf(result), sink);
  if (query) {
    wrap(query, 'get', 'query', (self) => queryTarget(self), (result) => sizeOf(result), sink);
    // An aggregation (`count()`) is its own class, not exported: wrap each one as it is made.
    const originalCount = query.count;
    if (typeof originalCount === 'function') {
      query.count = function tracedCount(this: unknown, ...args: unknown[]) {
        const aggregate = (originalCount as (...a: unknown[]) => Record<string, unknown>).apply(this, args);
        const target = queryTarget(this);
        try {
          wrap(aggregate, 'get', 'count', () => target, () => 1, sink);
        } catch {
          // Leave the aggregate as it was.
        }
        return aggregate;
      };
    }
  }
  if (transaction) {
    wrap(transaction, 'get', 'txn-get', (_self, args) => (args[0] && (args[0] as { path?: string }).path ? collectionOf((args[0] as { path: string }).path) : queryTarget(args[0])), (result) => sizeOf(result), sink);
    wrap(transaction, 'getAll', 'txn-getAll', (_self, args) => refsTarget(args), (result) => sizeOf(result), sink);
  }
  if (batch) {
    wrap(batch, 'commit', 'commit', () => 'batch', (result) => sizeOf(result), sink);
  }
}
