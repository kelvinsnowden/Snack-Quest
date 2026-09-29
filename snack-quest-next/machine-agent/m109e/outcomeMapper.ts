import { describeMotorResult } from './resultCodes';
import type { CurtainMode, MotorPoll, MotorRunReply } from './commands';

/** What the agent tells Snack Quest about one dispense. `unknown` whenever the agent can't be sure — never a guess. */
export type DispenseOutcome =
  | { status: 'dispensed'; faults: string[]; note: string }
  | { status: 'failed'; failureCode: string; reason: string }
  | { status: 'unknown'; reason: string };

export interface OutcomePolicy {
  /**
   * May "the curtain saw nothing fall" be trusted as proof that nothing
   * fell? **False until acceptance test S5** (≥ 200 vends per product
   * size, 100 % detected) passes on the real machine with our products.
   * While false, every run where the motor turned and the curtain saw
   * nothing is `unknown` — a person checks — instead of `failed` (which
   * would refund a customer who may have received the product).
   */
  curtainNegativeIsCertain: boolean;
}

export const CONSERVATIVE_POLICY: OutcomePolicy = { curtainNegativeIsCertain: false };

/** A run the board refused in a valid reply: the motor certainly did not turn. */
export function outcomeOfRefusal(reply: Exclude<MotorRunReply, 'started' | 'another_motor_running' | 'result_not_cleared'>): DispenseOutcome {
  return reply === 'invalid_motor'
    ? { status: 'failed', failureCode: 'm109e_invalid_motor', reason: 'the board refused the motor index (check the slot map); the motor did not turn' }
    : { status: 'unknown', reason: 'the board gave an undocumented answer to the motor run' };
}

/**
 * The M109E audit's §5.3 table: a finished run's result code (`Z3`) and
 * curtain reading (`Z10`) → the report. Anything that passed the curtain
 * is `dispensed` (with a fault noted if the run also reported a problem);
 * a run that never started is `failed`; everything else depends on
 * whether a curtain negative can be trusted yet.
 */
export function outcomeOfRun(poll: MotorPoll, expectedMotor: number, curtainMode: CurtainMode, policy: OutcomePolicy): DispenseOutcome {
  if (poll.state !== 'finished') return { status: 'unknown', reason: `the board did not report a finished run (state ${poll.rawState})` };
  if (poll.motor !== expectedMotor) return { status: 'unknown', reason: `the finished run is for motor ${poll.motor}, not ${expectedMotor}` };
  const result = describeMotorResult(poll.result);
  if (poll.result === 0x04) {
    return { status: 'failed', failureCode: 'sensor_failure', reason: 'the light curtain failed its self-test; the motor did not turn' };
  }
  if (curtainMode === 0) {
    return { status: 'unknown', reason: `curtain not used on this lane, so a drop can't be confirmed (board: ${result.name})` };
  }
  if (poll.dropMs > 0) {
    return { status: 'dispensed', faults: poll.result === 0x00 ? [] : [`m109e_${result.name}`], note: `curtain saw the product fall (${poll.dropMs} ms)${poll.result === 0x00 ? '' : `; board also reported ${result.name}`}` };
  }
  if (poll.result === 0x00 && curtainMode === 2) {
    // Mode 2 stops on a drop; "success" with nothing seen shouldn't happen.
    return { status: 'unknown', reason: 'the board reported success but the curtain saw nothing fall' };
  }
  if (!policy.curtainNegativeIsCertain) {
    return { status: 'unknown', reason: `the curtain saw nothing fall (board: ${result.name}); not yet proven reliable enough to refund on (acceptance test S5)` };
  }
  switch (poll.result) {
    case 0x00:
      return { status: 'failed', failureCode: 'no_product', reason: 'the motor ran and nothing fell' };
    case 0x01:
      return { status: 'failed', failureCode: 'jam', reason: 'over-current and nothing fell' };
    case 0x02:
      return { status: 'failed', failureCode: 'm109e_undercurrent', reason: 'under-current (motor wire off or load missing) and nothing fell' };
    case 0x03:
      return { status: 'failed', failureCode: 'no_product', reason: 'the motor ran to its timeout and nothing fell — empty or jammed' };
    case 0x05:
      return { status: 'failed', failureCode: 'm109e_door_not_open', reason: 'the delivery door did not open' };
    case 0x0a:
      return { status: 'failed', failureCode: 'm109e_switch', reason: 'the lane microswitch was not pressed and nothing fell' };
    default:
      return { status: 'unknown', reason: `undocumented result code 0x${poll.result.toString(16)}` };
  }
}
