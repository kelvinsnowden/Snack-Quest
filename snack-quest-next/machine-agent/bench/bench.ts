import { describeMotorResult } from '../m109e/resultCodes';
import { outcomeOfRun, CONSERVATIVE_POLICY } from '../m109e/outcomeMapper';
import type { M109eProtocolClient } from '../m109e/protocolClient';
import type { Clock } from '../agent/clock';
import type { CurtainMode } from '../m109e/commands';

/**
 * The bench tool: what a technician runs with the machine open (M109E
 * audit §10). Everything is read-only except `run`, which turns one
 * motor once and needs `--yes`. There is no set-address and no
 * broadcast: `FF` is not in the command table at all.
 *
 *   id <board>                       board id (01H)
 *   poll <board>                     motor state / last result (03H)
 *   temp <board>                     temperature (07H)
 *   inputs <board>                   DI1–DI4 (09H)
 *   humidity <board>                 humidity + temperature (10H)
 *   switch <board> <motor>           lane microswitch (2AH)
 *   row <board> <row>                row of microswitches (2BH)
 *   run <board> <motor> [--type 3] [--mode 2] [--timeout-tenths 0] --yes
 *                                    turn one motor once, then read the result (05H + 03H)
 */
export async function runBench(argv: string[], deps: { client: M109eProtocolClient; clock: Clock }): Promise<string[]> {
  const [command, ...rest] = argv;
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i].startsWith('--')) {
      const name = rest[i].slice(2);
      if (name === 'yes') flags.set('yes', 'true');
      else flags.set(name, rest[++i] ?? '');
    } else positional.push(rest[i]);
  }
  const int = (value: string | undefined, name: string, min: number, max: number) => {
    const parsed = Number(value);
    if (value === undefined || !Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${name} must be a whole number ${min}–${max}`);
    return parsed;
  };
  const board = () => int(positional[0], 'board', 1, 8);
  const { client } = deps;

  switch (command) {
    case 'id':
      return [`board ${board()} id ${(await client.getId(board())).hex}`];
    case 'poll': {
      const poll = await client.motorPoll(board());
      if (poll.state !== 'finished') return [`board ${board()}: ${poll.state ?? `unknown state ${poll.rawState}`}${poll.state === 'running' ? ` (motor ${poll.motor})` : ''}`];
      return [`board ${board()}: finished motor ${poll.motor}: ${describeMotorResult(poll.result).name}, drop ${poll.dropMs} ms, run ${poll.runTimeMs} ms, peak ${poll.peakCurrentMa} mA`];
    }
    case 'temp': {
      const celsius = await client.readTemperature(board());
      return [celsius === null ? `board ${board()}: no temperature probe (reads −50.0)` : `board ${board()}: ${celsius.toFixed(1)} °C`];
    }
    case 'inputs':
      return [`board ${board()}: ${(await client.readInputs(board())).map((on, i) => `DI${i + 1}=${on ? 'closed' : 'open'}`).join(' ')}`];
    case 'humidity': {
      const reading = await client.readHumidity(board());
      return [`board ${board()}: ${reading.humidityPct} % RH, ${reading.celsius} °C${reading.fresh ? '' : ' (stale)'}`];
    }
    case 'switch':
      return [`board ${board()} motor ${int(positional[1], 'motor', 0, 99)}: ${JSON.stringify(await client.readSwitch(board(), int(positional[1], 'motor', 0, 99)))}`];
    case 'row':
      return [`board ${board()} row ${int(positional[1], 'row', 0, 9)}: ${JSON.stringify(await client.readRowSwitches(board(), int(positional[1], 'row', 0, 9)))}`];
    case 'run': {
      if (flags.get('yes') !== 'true') return ['refused: `run` turns a motor. Add --yes to confirm.'];
      const motor = int(positional[1], 'motor', 0, 59);
      const curtainMode = int(flags.get('mode') ?? '2', 'mode', 0, 2) as CurtainMode;
      const timeoutTenths = int(flags.get('timeout-tenths') ?? '0', 'timeout-tenths', 0, 255);
      const before = await client.motorPoll(board());
      if (before.state !== 'idle') return [`refused: board is ${before.state ?? 'in an unknown state'}; read it with \`poll\` until idle first`];
      const reply = await client.motorRun(board(), { motor, motorType: int(flags.get('type') ?? '3', 'type', 0, 14), curtainMode, switchDelayTenths: 15, timeoutTenths, lockTimeTenths: 0 });
      if (reply !== 'started') return [`motor run: ${reply}${reply === 'no_reply' ? ' — the motor may or may not have turned; do NOT run it again, read it with `poll`' : ''}`];
      const deadline = deps.clock.now() + (timeoutTenths > 0 ? timeoutTenths * 100 : 7000) + 3000;
      let poll = await client.motorPoll(board());
      while (poll.state === 'running' && deps.clock.now() < deadline) {
        await deps.clock.sleep(200);
        poll = await client.motorPoll(board());
      }
      if (poll.state !== 'finished') return ['motor run: started', `no finished result before the deadline (state ${poll.state ?? poll.rawState})`];
      const outcome = outcomeOfRun(poll, motor, curtainMode, CONSERVATIVE_POLICY);
      return [
        'motor run: started',
        `result: ${describeMotorResult(poll.result).name}, drop ${poll.dropMs} ms, run ${poll.runTimeMs} ms, peak ${poll.peakCurrentMa} mA`,
        `agent would report: ${outcome.status}${'failureCode' in outcome ? ` (${outcome.failureCode})` : ''} — ${'reason' in outcome ? outcome.reason : outcome.note}`,
      ];
    }
    default:
      return ['commands: id, poll, temp, inputs, humidity, switch, row, run (see machine-agent/bench/bench.ts)'];
  }
}
