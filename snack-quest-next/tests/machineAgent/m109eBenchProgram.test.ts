import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { run } from '@/machine-agent/main';
import { lockBoard, BoardBusyError } from '@/machine-agent/agent/boardLock';

/**
 * The bench tool as the installed agent runs it (`agent.mjs bench …`,
 * which `snack-quest-bench` calls): the machine's own config, a fake
 * M109E (`transport.kind: "fake"`), the board lock shared with the agent,
 * and the agent's journal on disk. No API key and no Snack Quest needed.
 */
const SLOT = 'b1-m07';
const BOOT_ID = (() => {
  try {
    return readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
  } catch {
    return null;
  }
})();

const children: ChildProcess[] = [];
afterEach(() => {
  for (const child of children.splice(0)) child.kill();
});

/** A live process that looks like a running agent (`…agent.mjs` on its command line). */
async function liveAgentProcess(): Promise<ChildProcess> {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', 'agent.mjs'], { stdio: 'ignore' });
  children.push(child);
  await new Promise((done) => child.once('spawn', done));
  return child;
}

async function machine(options: { secret?: string } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'sq-bench-'));
  if (options.secret) await writeFile(join(dir, 'secret'), options.secret);
  const config = {
    snackQuest: { baseUrl: 'http://127.0.0.1:9', keyId: 'sqk_test_bench', secretFile: 'secret' },
    manufacturerMachineId: 'BENCH-001',
    transport: { kind: 'fake', stock: { [SLOT]: 2 }, temperatureCelsius: 6 },
    slots: [{ slotId: SLOT, motorType: 3, curtainMode: 2 }],
    dataDir: 'data',
  };
  const path = join(dir, 'config.json');
  await writeFile(path, JSON.stringify(config));
  const dataDir = join(dir, 'data');
  const bench = async (line: string) => {
    const lines: string[] = [];
    const code = await run(['bench', ...line.split(' '), '--config', path], { print: (text) => void lines.push(text) });
    return { code, lines };
  };
  return { dir, path, dataDir, bench };
}

async function holdBoard(dataDir: string, role: 'agent' | 'bench', pid: number) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, 'board.lock'), JSON.stringify({ pid, role, bootId: BOOT_ID }));
}

describe('bench commands on the installed agent', () => {
  it('lists the commands, and reads the board on a machine with no API key yet', async () => {
    const { bench } = await machine();
    const help = await bench('help');
    expect(help.code).toBe(0);
    expect(help.lines.join('\n')).toMatch(/run <board> <motor> --yes/);
    expect((await run(['bench'], { print: () => undefined }))).toBe(2);

    expect(await bench('temp 1')).toEqual({ code: 0, lines: ['board 1: 6.0 °C'] });
    expect((await bench('id 1')).lines[0]).toMatch(/^board 1 id [0-9A-F]+$/);
    expect((await bench('poll 1')).lines[0]).toMatch(/idle/);
  });

  it('turns a motor only with --yes, and can print every frame for the acceptance record', async () => {
    const { bench } = await machine();
    expect(await bench('run 1 7')).toEqual({ code: 1, lines: ['refused: `run` turns a motor. Add --yes to confirm.'] });
    const ran = await bench('run 1 7 --yes --frames');
    expect(ran.code).toBe(0);
    expect(ran.lines).toContain('motor run: started');
    expect(ran.lines.find((line) => line.startsWith('agent would report'))).toMatch(/dispensed/);
    expect(ran.lines.some((line) => line.startsWith('  tx 01 05 '))).toBe(true);
    expect(ran.lines.some((line) => line.startsWith('  rx '))).toBe(true);
  });

  it('reads and switches the light curtain and the outputs, printing --watch changes as they happen', async () => {
    const { bench } = await machine();
    expect(await bench('curtain 1')).toEqual({ code: 0, lines: ['board 1 curtain: clear, block timer 0 ms'] });
    expect(await bench('curtain 1 on')).toEqual({ code: 1, lines: ['refused: this switches the light curtain on. Add --yes to confirm.'] });
    expect(await bench('curtain 1 on --yes')).toEqual({ code: 0, lines: ['board 1 curtain: switched on'] });
    expect((await bench('output 1 2 on --yes')).lines[0]).toBe('board 1 output 2: on (confirmed by the board)');
    // Board 2 isn't on this machine: the board didn't answer, exit 1.
    expect((await bench('output 2 2 on --yes')).code).toBe(1);
    expect((await bench('output 1 2 sideways --yes')).code).toBe(2);

    const printed: { at: number; line: string }[] = [];
    const started = Date.now();
    const code = await run(['bench', 'curtain', '1', '--watch', '1', '--config', (await machine()).path], { print: (line) => void printed.push({ at: Date.now() - started, line }) });
    expect(code).toBe(0);
    expect(printed.map((entry) => entry.line)).toEqual([expect.stringMatching(/0\.0 s {2}board 1 curtain: clear/), 'watched 1 s: 0 changes']);
    // The first reading was printed straight away, not held until the watch ended.
    expect(printed[0].at).toBeLessThan(printed[1].at - 500);
  });

  it('says what is wrong with a command or the config', async () => {
    const { bench, dir } = await machine();
    expect(await bench('temp 9')).toEqual({ code: 2, lines: ['board must be a whole number 1–8'] });
    const missing = await run(['bench', 'temp', '1', '--config', join(dir, 'nope.json')], { print: () => undefined });
    expect(missing).toBe(2);
  });

  it('refuses while the agent is running, takes over a lock the agent left behind, and leaves no lock', async () => {
    const { bench, dataDir } = await machine();
    const agent = await liveAgentProcess();
    await holdBoard(dataDir, 'agent', agent.pid!);
    const refused = await bench('temp 1');
    expect(refused.code).toBe(1);
    expect(refused.lines[0]).toMatch(/the agent is running .*sudo systemctl stop snack-quest-agent/);

    agent.kill();
    await new Promise((done) => agent.once('exit', done));
    expect(await bench('temp 1')).toEqual({ code: 0, lines: ['board 1: 6.0 °C'] });
    await expect(access(join(dataDir, 'board.lock'))).rejects.toThrow();
  });

  it('refuses to read the motor result of a board with a vend the agent has not settled, but still reads its sensors', async () => {
    const { bench, dataDir } = await machine();
    await mkdir(dataDir, { recursive: true });
    const at = Date.now();
    await writeFile(
      join(dataDir, 'journal.jsonl'),
      [
        { t: 'received', commandId: 'cmd-open', type: 'dispense', slotId: SLOT, expiresAt: new Date(at + 60_000).toISOString(), at },
        { t: 'acked', commandId: 'cmd-open', at },
        { t: 'run_pending', commandId: 'cmd-open', board: 1, motor: 7, at },
      ]
        .map((entry) => JSON.stringify(entry))
        .join('\n') + '\n',
    );
    const poll = await bench('poll 1');
    expect(poll.code).toBe(1);
    expect(poll.lines[0]).toMatch(/unfinished vend on board 1 \(motor 7, command cmd-open\)/);
    expect((await bench('run 1 7 --yes')).lines[0]).toMatch(/^refused: the agent has an unfinished vend/);
    expect((await bench('temp 1')).code).toBe(0);
  });

  it('refuses motor commands when the journal is damaged, since it cannot check it', async () => {
    const { bench, dataDir } = await machine();
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, 'journal.jsonl'), 'not json\n{"t":"acked","commandId":"x","at":1}\n');
    expect((await bench('poll 1')).lines[0]).toMatch(/journal can't be read/);
    expect((await bench('temp 1')).code).toBe(0);
  });

  it('the agent waits while the bench tool holds the board', async () => {
    const { path, dataDir } = await machine({ secret: 'a-secret-long-enough-1234' });
    const benchTool = await liveAgentProcess();
    await holdBoard(dataDir, 'bench', benchTool.pid!);
    const logs: { level: string; message: string }[] = [];
    expect(await run(['--config', path], { log: (level, message) => void logs.push({ level, message }) })).toBe(1);
    expect(logs).toEqual([{ level: 'warn', message: expect.stringMatching(/in use by the bench tool .*starts once it is done/) }]);
  });
});

describe('board lock', () => {
  it('is held by one program at a time, and a lock from another boot, a dead program or a damaged file is taken over', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'sq-lock-'));
    const other = await liveAgentProcess();
    await holdBoard(dataDir, 'agent', other.pid!);
    await expect(lockBoard(dataDir, 'bench')).rejects.toBeInstanceOf(BoardBusyError);

    await writeFile(join(dataDir, 'board.lock'), JSON.stringify({ pid: other.pid, role: 'agent', bootId: 'an-earlier-boot' }));
    const release = await lockBoard(dataDir, 'bench');
    // Released only by its holder: a lock someone else took since is left alone.
    await holdBoard(dataDir, 'agent', other.pid!);
    await release();
    await expect(lockBoard(dataDir, 'bench')).rejects.toBeInstanceOf(BoardBusyError);

    await writeFile(join(dataDir, 'board.lock'), '{"pid":');
    const again = await lockBoard(dataDir, 'agent');
    await again();
    await expect(access(join(dataDir, 'board.lock'))).rejects.toThrow();
  });
});
