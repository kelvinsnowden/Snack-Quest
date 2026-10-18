import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { capabilityGate, type AcceptanceRecord, type GateResult, blankAcceptanceRecord } from '../acceptance/acceptanceRecord';
import type { LaneConfig } from '../m109e/slotMap';

/**
 * The agent's one config file (`/etc/snack-quest-agent/config.json` on a
 * machine). Everything that differs between machines is here; nothing
 * that a passed acceptance test decides is: the safety settings come
 * from the acceptance record file it points to, through `capabilityGate`.
 *
 * The API secret is never in this file — it lives in `secretFile`
 * (mode 0600), so the config can be read, copied and attached to a
 * support ticket safely.
 */
export interface AgentFileConfig {
  snackQuest: { baseUrl: string; keyId: string; secretFile: string };
  /** This machine's id as registered with Snack Quest (the integration's manufacturer machine id). */
  manufacturerMachineId: string;
  transport: SerialTransportConfig | FakeTransportConfig;
  /** One entry per lane, `b<board>-m<NN>`. */
  slots: LaneConfig[];
  /** The machine's acceptance record. Missing or null: a blank record — every safety setting stays conservative. */
  acceptanceRecordFile?: string | null;
  /** Journal, cooling range and downloaded updates live here. */
  dataDir: string;
}

export interface SerialTransportConfig {
  kind: 'serial';
  /** e.g. /dev/ttyUSB0 (a USB-RS232 adapter) or /dev/ttyAMA0. */
  device: string;
  /** The document's line settings are 9600 8N1; only the speed is configurable. */
  baud?: number;
}

/**
 * A simulated M109E instead of a serial port: the whole agent runs for
 * real (API, journal, commands) against a board that follows the
 * protocol document. For staging, training and demos — refused with a
 * live (non-sandbox) key, so a fake machine can never take real money.
 */
export interface FakeTransportConfig {
  kind: 'fake';
  /** Starting stock per lane, e.g. { "b1-m07": 5 }. Lanes not listed start empty. */
  stock?: Record<string, number>;
  /** Cabinet temperature the fake probe reads (default 5 °C). */
  temperatureCelsius?: number;
}

export interface LoadedConfig extends AgentFileConfig {
  secret: string;
  acceptance: AcceptanceRecord;
  gate: GateResult;
}

export class AgentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentConfigError';
  }
}

const SLOT_ID = /^b[1-8]-m\d{2}$/;

/** Checks the parsed file. Throws `AgentConfigError` naming the first problem, so a technician can fix it from the log. */
export function validateConfig(raw: unknown): AgentFileConfig {
  const fail = (message: string): never => {
    throw new AgentConfigError(message);
  };
  const config = (raw ?? {}) as Record<string, unknown>;
  const sq = (config.snackQuest ?? {}) as Record<string, unknown>;
  if (typeof sq.baseUrl !== 'string' || !/^https?:\/\//.test(sq.baseUrl)) fail('snackQuest.baseUrl must be the site address, e.g. https://www.snackquests.shop');
  if (typeof sq.baseUrl === 'string' && sq.baseUrl.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(sq.baseUrl)) fail('snackQuest.baseUrl must use https (http only for localhost)');
  if (typeof sq.keyId !== 'string' || !/^sqk_(live|test)_/.test(sq.keyId)) fail('snackQuest.keyId must be a machine API key id (sqk_live_… or sqk_test_…)');
  if (typeof sq.secretFile !== 'string' || !sq.secretFile) fail('snackQuest.secretFile must point to the file holding the API secret');
  if (typeof config.manufacturerMachineId !== 'string' || !config.manufacturerMachineId.trim()) fail('manufacturerMachineId is required');
  if (typeof config.dataDir !== 'string' || !config.dataDir) fail('dataDir is required');

  const transport = (config.transport ?? {}) as Record<string, unknown>;
  if (transport.kind === 'serial') {
    if (typeof transport.device !== 'string' || !transport.device.startsWith('/dev/')) fail('transport.device must be a /dev path, e.g. /dev/ttyUSB0');
    if (transport.baud !== undefined && ![9600, 19200, 38400, 57600, 115200].includes(transport.baud as number)) fail('transport.baud must be a standard speed (the document says 9600)');
  } else if (transport.kind === 'fake') {
    if (!(sq.keyId as string).startsWith('sqk_test_')) fail('a fake machine only runs with a sandbox key (sqk_test_…), never a live one');
    for (const [slot, count] of Object.entries((transport.stock ?? {}) as Record<string, unknown>)) {
      if (!SLOT_ID.test(slot) || !Number.isInteger(count) || (count as number) < 0) fail(`transport.stock: "${slot}" needs a whole number of products`);
    }
  } else {
    fail('transport.kind must be "serial" or "fake"');
  }

  if (!Array.isArray(config.slots) || config.slots.length === 0) fail('slots must list at least one lane');
  return config as unknown as AgentFileConfig;
}

/** Reads the config, its secret and the acceptance record; resolves relative paths against the config file. */
export async function loadConfig(path: string): Promise<LoadedConfig> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new AgentConfigError(`can't read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const config = validateConfig(parsed);
  const near = (file: string) => (isAbsolute(file) ? file : resolve(dirname(path), file));
  config.snackQuest.secretFile = near(config.snackQuest.secretFile);
  config.dataDir = near(config.dataDir);

  let secret: string;
  try {
    secret = (await readFile(config.snackQuest.secretFile, 'utf8')).trim();
  } catch {
    throw new AgentConfigError(`can't read the API secret from ${config.snackQuest.secretFile}`);
  }
  if (secret.length < 16) throw new AgentConfigError(`${config.snackQuest.secretFile} doesn't hold an API secret`);

  let acceptance = blankAcceptanceRecord('M109E');
  if (config.acceptanceRecordFile) {
    const file = near(config.acceptanceRecordFile);
    try {
      acceptance = JSON.parse(await readFile(file, 'utf8')) as AcceptanceRecord;
    } catch (error) {
      throw new AgentConfigError(`can't read the acceptance record ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // Throws on a record that claims results it can't back.
  const gate = capabilityGate(acceptance);
  return { ...config, secret, acceptance, gate };
}
