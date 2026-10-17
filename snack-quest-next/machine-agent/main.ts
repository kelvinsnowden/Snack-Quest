import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { SnackQuestMachineClient } from '../sdk/typescript/snackQuestMachine';
import { AgentConfigError, loadConfig, type LoadedConfig } from './config/agentConfig';
import { M109eMachineAgent, AGENT_RELEASE, AGENT_VERSION } from './agent/m109eAgent';
import { FileCoolingStore } from './agent/coolingStore';
import { systemClock } from './agent/clock';
import { FileJournalStorage, Journal, JournalCorruptError } from './journal/journal';
import { DispenseDriver } from './m109e/dispenseDriver';
import { M109eProtocolClient } from './m109e/protocolClient';
import { SlotMap } from './m109e/slotMap';
import { FakeM109eBoard, FakeM109eBus } from './transport/fakeM109e';
import { PortSerialTransport, openLinuxSerialPort } from './transport/linuxSerialTransport';
import type { SerialTransport } from './transport/serialTransport';
import { AgentUpdater } from './update/updater';

/**
 * The Machine Agent as a program:
 *
 *   node agent.mjs [--config /etc/snack-quest-agent/config.json] [--check]
 *
 * Runs the agent loop until stopped, sleeping between cycles as Snack
 * Quest asks (`nextPollSeconds`) and backing off on errors. Meant to run
 * under systemd (`deploy/snack-quest-agent.service`), which restarts it
 * after an update, a crash or a power cut — every restart begins with
 * the journal's crash recovery, so nothing is run twice.
 *
 * Exit codes: 0 stopped or restarting for an update; 78 the config or
 * acceptance record is wrong, or the journal is damaged — a person must
 * look, so systemd does not restart it; anything else is a crash.
 */
export const EXIT_NEEDS_A_PERSON = 78;

const DEFAULT_CONFIG = '/etc/snack-quest-agent/config.json';
const MAX_BACKOFF_MS = 60_000;
/** The fake board's identity bytes (as the manufacturer's sample card answers 01H). */
const FAKE_BOARD_ID = [0, 0x64, 0, 0x3b, 4, 0x47, 0x36, 0x32, 0x33, 0x38, 0x36, 0x39];

type Log = (level: 'info' | 'warn' | 'error', message: string, extra?: Record<string, unknown>) => void;

/** One JSON line per event on stdout: journald keeps it, and support can grep it. */
const log: Log = (level, message, extra = {}) => {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), level, message, ...extra })}\n`);
};

export async function buildTransport(config: LoadedConfig, slots: SlotMap): Promise<{ transport: SerialTransport; boards: FakeM109eBoard[] }> {
  if (config.transport.kind === 'serial') {
    const port = await openLinuxSerialPort(config.transport.device, config.transport.baud ?? 9600);
    return { transport: new PortSerialTransport(port), boards: [] };
  }
  // A simulated machine in real time: products drop, the curtain sees them, the probe reads a temperature.
  const bus = new FakeM109eBus();
  const boards = slots.boards().map((address) =>
    bus.add(new FakeM109eBoard(address, FAKE_BOARD_ID, systemClock, { doorInput: config.gate.agent.doorInput ?? undefined })),
  );
  for (const [slotId, count] of Object.entries(config.transport.stock ?? {})) {
    const lane = slots.get(slotId);
    const board = lane ? boards.find((candidate) => candidate.address === lane.board) : undefined;
    if (lane && board) board.load(lane.run.motor, count);
  }
  for (const board of boards) board.temperatureTenths = Math.round((config.transport.temperatureCelsius ?? 5) * 10);
  return { transport: bus, boards };
}

export async function createAgent(config: LoadedConfig, options: { installDir?: string } = {}) {
  const slots = new SlotMap(config.slots);
  const { transport, boards } = await buildTransport(config, slots);
  const board = new M109eProtocolClient(transport);
  const journal = await Journal.open(new FileJournalStorage(join(config.dataDir, 'journal.jsonl')));
  const driver = new DispenseDriver(board, journal, slots, systemClock, {
    policy: { curtainNegativeIsCertain: config.gate.agent.curtainNegativeIsCertain },
    resultsPersistUntilRead: config.gate.agent.resultsPersistUntilRead,
  });
  const api = new SnackQuestMachineClient({ baseUrl: config.snackQuest.baseUrl, keyId: config.snackQuest.keyId, secret: config.secret });
  const agent = new M109eMachineAgent(api, board, slots, journal, driver, {
    manufacturerMachineId: config.manufacturerMachineId,
    doorInput: config.gate.agent.doorInput,
    cooling: config.gate.agent.cooling,
    coolingStore: new FileCoolingStore(join(config.dataDir, 'cooling.json')),
    updater: options.installDir ? new AgentUpdater({ installDir: options.installDir, siteUrl: config.snackQuest.baseUrl }) : undefined,
  });
  return { agent, transport, slots, boards };
}

/** Tells systemd the loop is alive (`WatchdogSec` in the unit). A no-op when not run by systemd. */
function pingWatchdog(): void {
  if (!process.env.NOTIFY_SOCKET) return;
  execFile('systemd-notify', ['WATCHDOG=1'], () => undefined);
}

export async function run(argv: string[], options: { stop?: AbortSignal; log?: Log } = {}): Promise<number> {
  const say = options.log ?? log;
  const configPath = argv.includes('--config') ? argv[argv.indexOf('--config') + 1] : DEFAULT_CONFIG;
  let config: LoadedConfig;
  try {
    config = await loadConfig(configPath);
  } catch (error) {
    say('error', error instanceof Error ? error.message : String(error));
    return EXIT_NEEDS_A_PERSON;
  }

  let built: Awaited<ReturnType<typeof createAgent>>;
  try {
    built = await createAgent(config, { installDir: process.env.SNACK_QUEST_AGENT_HOME });
  } catch (error) {
    say('error', `can't start: ${error instanceof Error ? error.message : String(error)}`);
    return error instanceof JournalCorruptError || error instanceof AgentConfigError || (error as Error)?.name === 'SlotMapError' ? EXIT_NEEDS_A_PERSON : 1;
  }
  const { agent, transport, slots } = built;

  say('info', 'starting', {
    version: AGENT_VERSION,
    machine: config.manufacturerMachineId,
    transport: config.transport.kind,
    lanes: config.slots.length,
    lanesWithoutCurtain: slots.withoutCurtain,
    declared: config.gate.declaredCapabilities,
    safety: config.gate.agent,
  });
  if (argv.includes('--check')) {
    await transport.close();
    say('info', 'config is valid', { release: AGENT_RELEASE, productionBlockers: config.gate.productionBlockers });
    return 0;
  }

  let stopping = false;
  options.stop?.addEventListener('abort', () => {
    stopping = true;
  });
  const sleep = (ms: number) =>
    new Promise<void>((done) => {
      const timer = setTimeout(done, ms);
      options.stop?.addEventListener('abort', () => {
        clearTimeout(timer);
        done();
      });
    });

  let failures = 0;
  try {
    while (!stopping) {
      let waitMs: number;
      try {
        const result = await agent.cycle();
        failures = 0;
        if (result.executed.length || result.refused.length) say('info', 'cycle', { executed: result.executed, refused: result.refused });
        pingWatchdog();
        waitMs = Math.min(60, Math.max(1, result.nextPollSeconds)) * 1000;
      } catch (error) {
        if (error instanceof JournalCorruptError) {
          say('error', error.message);
          return EXIT_NEEDS_A_PERSON;
        }
        failures += 1;
        const message = error instanceof Error ? error.message : String(error);
        agent.lastError = { message: message.slice(0, 300), at: new Date().toISOString() };
        waitMs = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(failures, 6));
        say('warn', 'cycle failed', { error: message, retryInMs: waitMs });
      }
      if (agent.restartRequested) {
        say('info', 'update installed; restarting into it');
        return 0;
      }
      await sleep(waitMs);
    }
    say('info', 'stopped');
    return 0;
  } finally {
    await transport.close().catch(() => undefined);
  }
}

// Run when executed directly (the bundle), not when imported by tests.
const invokedDirectly = typeof process !== 'undefined' && process.argv[1] && /(?:main\.ts|agent[^/]*\.mjs)$/.test(process.argv[1]);
if (invokedDirectly) {
  const controller = new AbortController();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => controller.abort());
  run(process.argv.slice(2), { stop: controller.signal }).then(
    (code) => process.exit(code),
    (error: unknown) => {
      log('error', 'crashed', { error: error instanceof Error ? error.stack : String(error) });
      process.exit(1);
    },
  );
}
