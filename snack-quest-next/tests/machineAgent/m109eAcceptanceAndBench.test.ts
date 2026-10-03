import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACCEPTANCE_TESTS, AcceptanceRecordError, CAPABILITY_EVIDENCE, IMPOSSIBLE_CAPABILITIES, blankAcceptanceRecord, capabilityGate, type AcceptanceRecord } from '@/machine-agent/acceptance/acceptanceRecord';
import { runBench } from '@/machine-agent/bench/bench';
import { FakeClock } from '@/machine-agent/agent/clock';
import { FakeM109eBoard, FakeM109eBus } from '@/machine-agent/transport/fakeM109e';
import { M109eProtocolClient } from '@/machine-agent/m109e/protocolClient';
import { CMD } from '@/machine-agent/m109e/commands';

const pass = (record: AcceptanceRecord, ...ids: string[]) => {
  for (const id of ids) record.results[id] = { result: 'passed', date: '2026-10-01', tester: 'bench tech', evidence: `logs/${id}` };
  return record;
};

describe('acceptance record and capability gate', () => {
  it('lists every §10 test once', () => {
    const ids = ACCEPTANCE_TESTS.map((test) => test.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(6 + 9 + 12 + 13 + 8 + 7);
  });

  it('declares nothing and relaxes nothing on a blank record', () => {
    const gate = capabilityGate(blankAcceptanceRecord('M109E'));
    expect(gate.declaredCapabilities).toEqual([]);
    expect(gate.agent).toEqual({ curtainNegativeIsCertain: false, resultsPersistUntilRead: false, doorInput: null });
    expect(gate.productionBlockers).toContain('S5');
    expect(gate.productionBlockers).toContain('P7');
  });

  it('declares a capability only when every test behind it passed, and never an impossible one', () => {
    const record = pass(blankAcceptanceRecord('M109E'), ...CAPABILITY_EVIDENCE.vend, 'S8');
    const gate = capabilityGate(record);
    expect(gate.declaredCapabilities.sort()).toEqual(['temperature', 'vend']);
    expect(gate.withheld.find((item) => item.capability === 'dispense_confirmation')?.missing).toContain('S5');
    const everything = pass(blankAcceptanceRecord('M109E'), ...ACCEPTANCE_TESTS.map((test) => test.id));
    everything.findings = { resultClearing: 'until_read', doorInput: 1 };
    const all = capabilityGate(everything);
    for (const impossible of IMPOSSIBLE_CAPABILITIES) expect(all.declaredCapabilities).not.toContain(impossible);
    expect(all.productionBlockers).toEqual([]);
  });

  it('relaxes the agent only on the tests that prove it', () => {
    const record = pass(blankAcceptanceRecord('M109E'), 'S3', 'S5', 'S7', 'S10');
    record.findings = { resultClearing: 'timer', doorInput: null };
    expect(capabilityGate(record).agent).toEqual({ curtainNegativeIsCertain: true, resultsPersistUntilRead: false, doorInput: null });
    record.findings = { resultClearing: 'until_read', doorInput: 2 };
    expect(capabilityGate(record).agent).toEqual({ curtainNegativeIsCertain: true, resultsPersistUntilRead: true, doorInput: 2 });
    // A door capability needs a door.
    expect(capabilityGate(pass(blankAcceptanceRecord('M109E'), 'S10')).declaredCapabilities).not.toContain('door_status');
  });

  it('refuses results it cannot back', () => {
    const noEvidence = blankAcceptanceRecord('M109E');
    noEvidence.results.S5 = { result: 'passed', date: '2026-10-01', tester: 'x' };
    expect(() => capabilityGate(noEvidence)).toThrow(AcceptanceRecordError);
    const unknownTest = blankAcceptanceRecord('M109E');
    unknownTest.results.Z9 = { result: 'not_run' };
    expect(() => capabilityGate(unknownTest)).toThrow(AcceptanceRecordError);
    const findingWithoutTest = blankAcceptanceRecord('M109E');
    findingWithoutTest.findings.resultClearing = 'until_read';
    expect(() => capabilityGate(findingWithoutTest)).toThrow(/S7/);
    const failed = pass(blankAcceptanceRecord('M109E'), 'S3');
    failed.results.S5 = { result: 'failed', date: '2026-10-01', tester: 'x', evidence: '198/200 detected' };
    const gate = capabilityGate(failed);
    expect(gate.failed).toEqual(['S5']);
    expect(gate.agent.curtainNegativeIsCertain).toBe(false);
  });

  it('the template in docs is a valid blank record', () => {
    const template = JSON.parse(readFileSync(resolve(__dirname, '../../docs/hardware/M109E_ACCEPTANCE_RECORD.template.json'), 'utf8')) as AcceptanceRecord;
    const gate = capabilityGate(template);
    expect(gate.declaredCapabilities).toEqual([]);
    expect(Object.keys(template.results).sort()).toEqual(ACCEPTANCE_TESTS.map((test) => test.id).sort());
  });
});

describe('bench tool', () => {
  function bench() {
    const clock = new FakeClock();
    const bus = new FakeM109eBus();
    const board = bus.add(new FakeM109eBoard(1, [0, 0x64, 0, 0x3b, 4, 0x47, 0x36, 0x32, 0x33, 0x38, 0x36, 0x39], clock));
    const client = new M109eProtocolClient(bus, { now: () => clock.now() });
    return { bus, board, run: (line: string) => runBench(line.split(' '), { client, clock }) };
  }

  it('reads without touching a motor', async () => {
    const { bus, board, run } = bench();
    expect(await run('id 1')).toEqual(['board 1 id 0064003B0447363233383639']);
    expect((await run('poll 1'))[0]).toMatch(/idle/);
    expect((await run('inputs 1'))[0]).toMatch(/DI1=closed/);
    await run('temp 1');
    expect(board.rotations).toEqual([]);
    expect(bus.written.every((frame) => frame[1] !== CMD.MOTOR_RUN)).toBe(true);
  });

  it('turns a motor only with --yes, once, and says what the agent would report', async () => {
    const { board, run } = bench();
    board.load(7, 2);
    expect(await run('run 1 7')).toEqual(['refused: `run` turns a motor. Add --yes to confirm.']);
    expect(board.rotations).toEqual([]);
    const lines = await run('run 1 7 --yes');
    expect(lines[0]).toBe('motor run: started');
    expect(lines[2]).toMatch(/agent would report: dispensed/);
    expect(board.rotations).toEqual([7]);
    expect((await run('run 1 7 --yes --timeout-tenths 20'))[0]).toBe('motor run: started');
    expect((await run('run 1 60 --yes').catch((error: Error) => [error.message]))[0]).toMatch(/motor must be/);
  });
});

describe('machine-agent boundary', () => {
  it('imports nothing from the app except the reference SDK', () => {
    const root = resolve(__dirname, '../../machine-agent');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.ts')) files.push(path);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(10);
    const offenders: string[] = [];
    for (const file of files) {
      for (const match of readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'/g)) {
        const spec = match[1];
        if (spec.startsWith('node:')) continue;
        if (spec.startsWith('@/') || !spec.startsWith('.')) {
          offenders.push(`${relative(root, file)} → ${spec}`);
          continue;
        }
        const target = resolve(dirname(file), spec);
        const inside = target.startsWith(root);
        const sdk = target.startsWith(resolve(root, '../sdk/typescript'));
        if (!inside && !sdk) offenders.push(`${relative(root, file)} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
