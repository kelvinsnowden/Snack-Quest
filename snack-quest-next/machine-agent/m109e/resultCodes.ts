/**
 * `03H Z3` — how a motor run ended (§5.2). For each code: whether the
 * motor ever started, and whether the code on its own proves nothing
 * dropped. "Proves nothing dropped" is only ever true where the motor
 * never moved; everything else needs the light curtain (`Z10`) to say
 * what happened to the product.
 */
export interface MotorResultMeaning {
  code: number;
  name: string;
  meaning: string;
  motorStarted: boolean;
  /** The code alone proves no product left the machine. */
  certainNothingDropped: boolean;
}

export const MOTOR_RESULTS: Readonly<Record<number, MotorResultMeaning>> = {
  0x00: { code: 0x00, name: 'success', meaning: 'Motor completed normally', motorStarted: true, certainNothingDropped: false },
  0x01: { code: 0x01, name: 'overcurrent', meaning: 'Over-current / overload / jammed goods', motorStarted: true, certainNothingDropped: false },
  0x02: { code: 0x02, name: 'undercurrent', meaning: 'Under-current: motor wire off or load missing', motorStarted: true, certainNothingDropped: false },
  0x03: { code: 0x03, name: 'timeout', meaning: 'No in-position signal before the timeout (heavy load, jam or PSU interference)', motorStarted: true, certainNothingDropped: false },
  0x04: { code: 0x04, name: 'curtain_self_test_failed', meaning: 'Light-curtain self-test failed; motor not started', motorStarted: false, certainNothingDropped: true },
  0x05: { code: 0x05, name: 'door_not_open', meaning: 'Feedback solenoid door did not open', motorStarted: true, certainNothingDropped: false },
  0x0a: { code: 0x0a, name: 'switch_not_pressed', meaning: 'Three-wire motor energised 1.5 s but its microswitch was not pressed', motorStarted: true, certainNothingDropped: false },
};

export function describeMotorResult(code: number): MotorResultMeaning {
  return MOTOR_RESULTS[code] ?? { code, name: 'undocumented', meaning: `Result code 0x${code.toString(16).padStart(2, '0')} is not in the document`, motorStarted: true, certainNothingDropped: false };
}
