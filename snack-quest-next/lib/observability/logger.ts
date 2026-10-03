import { redact } from './redact';

/**
 * Structured, redacted logging for the integration layer. One JSON
 * object per line on stdout/stderr — what Vercel's log drain (and any
 * later log pipeline) indexes by field, so "every request for
 * SQ-MCH-000042 between 14:30 and 14:35" is a filter, not a grep.
 *
 * Every entry goes through `redact()` (lib/observability/redact.ts);
 * there is no way to log around it from this module.
 *
 * Tests can capture entries with `captureLogs()` instead of spying on
 * the console.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  msg: string;
  ts: string;
  [field: string]: unknown;
}

type Sink = (entry: LogEntry) => void;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minimumLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL as LogLevel | undefined;
  if (configured && configured in LEVEL_ORDER) {
    return configured;
  }
  return process.env.NODE_ENV === 'test' ? 'warn' : 'info';
}

const consoleSink: Sink = (entry) => {
  const line = JSON.stringify(entry);
  if (entry.level === 'error' || entry.level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
};

let sinks: Sink[] = [consoleSink];

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

function build(bound: Record<string, unknown>): Logger {
  const emit = (level: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    const captured = sinks.length > 1 || sinks[0] !== consoleSink;
    if (!captured && LEVEL_ORDER[level] < LEVEL_ORDER[minimumLevel()]) {
      return;
    }
    const entry = redact({ ...bound, ...fields }) as Record<string, unknown>;
    const full: LogEntry = { level, msg, ts: new Date().toISOString(), ...entry };
    for (const sink of sinks) {
      sink(full);
    }
  };
  return {
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
    child: (fields) => build({ ...bound, ...fields }),
  };
}

export const logger: Logger = build({ service: 'snack-quest' });

/** Replaces the output with an in-memory buffer until `restore()` — for tests asserting what was (and wasn't) logged. */
export function captureLogs(): { entries: LogEntry[]; restore(): void } {
  const entries: LogEntry[] = [];
  const previous = sinks;
  sinks = [(entry) => entries.push(entry)];
  return {
    entries,
    restore() {
      sinks = previous;
    },
  };
}
