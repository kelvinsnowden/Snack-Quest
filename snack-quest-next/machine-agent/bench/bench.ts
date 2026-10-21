import { describeMotorResult } from '../m109e/resultCodes';
import { outcomeOfRun, CONSERVATIVE_POLICY } from '../m109e/outcomeMapper';
import type { M109eProtocolClient } from '../m109e/protocolClient';
import type { Clock } from '../agent/clock';
import type { CurtainMode } from '../m109e/commands';

/**
 * The bench tool: what a technician runs with the machine open (M109E
 * audit §10). Everything is read-only except `run`, `curtain … on|off`
 * and `output`, which change the machine and need `--yes`. There is no
 * set-address and no broadcast: `FF` is not in the command table at all.
 *
 *   id <board>                       board id (01H)
 *   poll <board>                     motor state / last result (03H)
 *   temp <board>                     temperature (07H)
 *   inputs <board> [--watch <s>]     DI1–DI4 (09H)
 *   humidity <board>                 humidity + temperature (10H)
 *   switch <board> <motor>           lane microswitch (2AH)
 *   row <board> <row>                row of microswitches (2BH)
 *   curtain <board> [--watch <s>]    light curtain: blocked or clear, and its block timer (0CH + 0DH)
 *   curtain <board> on|off --yes     power the light curtain (0BH)
 *   output <board> <index> on|off --yes
 *                                    switch a digital output 0–6 (08H)
 *   run <board> <motor> [--type 3] [--mode 2] [--timeout-tenths 0] --yes
 *                                    turn one motor once, then read the result (05H + 03H)
 *
 * `--watch <seconds>` reads every 250 ms for that long and says each
 * change as it happens (through `say`), for the tests where a reading
 * must follow a hand in the curtain or a door opening.
 *
 * Reading a board's motor result can clear it, and the agent settles a
 * vend that a restart interrupted by reading that result. `unsettledRun`
 * says whether the agent's journal still waits on one for a board; if it
 * does, `poll` and `run` are refused there.
 */
export async function runBench(
  argv: string[],
  deps: { client: M109eProtocolClient; clock: Clock; unsettledRun?: (board: number) => string | null; say?: (line: string) => void },
): Promise<string[]> {
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
  const switchTo = (value: string | undefined) => {
    if (value !== 'on' && value !== 'off') throw new Error('say on or off');
    return value === 'on';
  };
  const watched = async (read: () => Promise<string>): Promise<string[]> => {
    if (!flags.has('watch')) return [await read()];
    const seconds = int(flags.get('watch'), 'watch', 1, 300);
    const lines: string[] = [];
    const say = deps.say ?? ((line: string) => void lines.push(line));
    const start = deps.clock.now();
    let last: string | null = null;
    let changes = 0;
    while (deps.clock.now() - start <= seconds * 1000) {
      const reading = await read();
      if (reading !== last) {
        say(`${((deps.clock.now() - start) / 1000).toFixed(1).padStart(5)} s  ${reading}`);
        if (last !== null) changes += 1;
        last = reading;
      }
      await deps.clock.sleep(250);
    }
    lines.push(`watched ${seconds} s: ${changes} change${changes === 1 ? '' : 's'}`);
    return lines;
  };
  const { client } = deps;
  if (command === 'poll' || command === 'run') {
    const unsettled = deps.unsettledRun?.(board());
    if (unsettled) return [`refused: ${unsettled}`];
  }

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
      return watched(async () => `board ${board()}: ${(await client.readInputs(board())).map((on, i) => `DI${i + 1}=${on ? 'closed' : 'open'}`).join(' ')}`);
    case 'humidity': {
      const reading = await client.readHumidity(board());
      return [`board ${board()}: ${reading.humidityPct} % RH, ${reading.celsius} °C${reading.fresh ? '' : ' (stale)'}`];
    }
    case 'switch':
      return [`board ${board()} motor ${int(positional[1], 'motor', 0, 99)}: ${JSON.stringify(await client.readSwitch(board(), int(positional[1], 'motor', 0, 99)))}`];
    case 'row':
      return [`board ${board()} row ${int(positional[1], 'row', 0, 9)}: ${JSON.stringify(await client.readRowSwitches(board(), int(positional[1], 'row', 0, 9)))}`];
    case 'curtain': {
      if (positional[1] === undefined) {
        return watched(async () => {
          const { blocked } = await client.readCurtain(board());
          const { blockedMs } = await client.readCurtainTimer(board());
          return `board ${board()} curtain: ${blocked ? 'BLOCKED' : 'clear'}, block timer ${blockedMs} ms`;
        });
      }
      const on = switchTo(positional[1]);
      if (flags.get('yes') !== 'true') return [`refused: this switches the light curtain ${on ? 'on' : 'off'}. Add --yes to confirm.`];
      if (!(await client.curtainPower(board(), on))) {
        return [`no answer: board ${board()} did not answer the curtain ${on ? 'on' : 'off'} command, so it may or may not have switched (the document doesn't say whether 0BH is answered)`];
      }
      return on
        ? [`board ${board()} curtain: switched on`]
        : [`board ${board()} curtain: switched off`, `switch it back on before the agent starts: sudo snack-quest-bench curtain ${board()} on --yes`];
    }
    case 'output': {
      const index = int(positional[1], 'output', 0, 6);
      const on = switchTo(positional[2]);
      const state = on ? 'on' : 'off';
      if (flags.get('yes') !== 'true') return [`refused: this switches output ${index} ${state}, which may drive the compressor, a fan, a heater or the lights. Add --yes to confirm.`];
      if (!(await client.writeOutput(board(), index, on))) return [`no answer: board ${board()} did not confirm output ${index} ${state}, so it may or may not have switched`];
      return [`board ${board()} output ${index}: ${state} (confirmed by the board)`, `note what it drives, then set it back: sudo snack-quest-bench output ${board()} ${index} ${on ? 'off' : 'on'} --yes`];
    }
    case 'run': {
      if (flags.get('yes') !== 'true') return ['refused: `run` turns a motor. Add --yes to confirm.'];
      const motor = int(positional[1], 'motor', 0, 59);
      const curtainMode = int(flags.get('mode') ?? '2', 'mode', 0, 2) as CurtainMode;
      const timeoutTenths = int(flags.get('timeout-tenths') ?? '0', 'timeout-tenths', 0, 255);
      const before = await client.motorPoll(board());
      if (before.state !== 'idle') return [`refused: board is ${before.state ?? 'in an unknown state'}; read it with \`poll\` until idle first`];
      const reply = await client.motorRun(board(), { motor, motorType: int(flags.get('type') ?? '3', 'type', 0, 14), curtainMode, switchDelayTenths: 15, timeoutTenths, lockTimeTenths: 0 });
      if (reply === 'no_reply') return ['no answer: the motor run got no reply, so the motor may or may not have turned; do NOT run it again, read it with `poll`'];
      if (reply !== 'started') return [`refused: the board answered the motor run with "${reply}"`];
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
      return ['commands: id, poll, temp, inputs, humidity, switch, row, curtain, output, run (see machine-agent/bench/bench.ts)'];
  }
}
