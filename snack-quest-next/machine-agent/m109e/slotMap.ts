import { MAX_RUN_MOTOR_INDEX, type CurtainMode, type MotorRunParams } from './commands';

/**
 * Which physical motor sells each slot, and how to drive it. Snack
 * Quest's `manufacturerSlotId` for an M109E lane is `b<board>-m<NN>` —
 * board address 1–8, motor index 00–59 — and the per-lane settings
 * (motor type, curtain mode, timings) live here, on the machine, because
 * the board stores none of them (they're parameters of every `05H`).
 * Which motor index is which tray and column is only known once someone
 * maps the real machine (acceptance test M9).
 */
export interface LaneConfig {
  slotId: string;
  motorType: number;
  curtainMode: CurtainMode;
  switchDelayTenths?: number;
  timeoutTenths?: number;
  lockTimeTenths?: number;
}

export interface Lane {
  slotId: string;
  board: number;
  run: MotorRunParams;
  /** How long to wait for the run to finish before calling it unknown: the lane's timeout (or 7 s) plus 3 s. */
  completionDeadlineMs: number;
}

export class SlotMapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlotMapError';
  }
}

const SLOT_ID = /^b([1-8])-m(\d{2})$/;

export class SlotMap {
  private readonly lanes = new Map<string, Lane>();
  /** Lanes with no curtain: every dispense on them will be reported `unknown`. Listed so the operator sees it at start-up. */
  readonly withoutCurtain: string[] = [];

  constructor(config: LaneConfig[], options: { maxMotorIndex?: number } = {}) {
    const max = options.maxMotorIndex ?? MAX_RUN_MOTOR_INDEX;
    for (const lane of config) {
      const match = SLOT_ID.exec(lane.slotId);
      if (!match) throw new SlotMapError(`slot "${lane.slotId}" must look like b1-m07 (board 1–8, two-digit motor)`);
      const board = Number(match[1]);
      const motor = Number(match[2]);
      if (motor > max) throw new SlotMapError(`slot "${lane.slotId}": motor ${motor} is above ${max}`);
      if (this.lanes.has(lane.slotId)) throw new SlotMapError(`slot "${lane.slotId}" is listed twice`);
      if (!Number.isInteger(lane.motorType) || lane.motorType < 0 || lane.motorType > 0x0e) throw new SlotMapError(`slot "${lane.slotId}": motor type must be 0x00–0x0E`);
      if (![0, 1, 2].includes(lane.curtainMode)) throw new SlotMapError(`slot "${lane.slotId}": curtain mode must be 0, 1 or 2`);
      const timeoutTenths = lane.timeoutTenths ?? 0;
      this.lanes.set(lane.slotId, {
        slotId: lane.slotId,
        board,
        run: { motor, motorType: lane.motorType, curtainMode: lane.curtainMode, switchDelayTenths: lane.switchDelayTenths ?? 15, timeoutTenths, lockTimeTenths: lane.lockTimeTenths ?? 0 },
        completionDeadlineMs: (timeoutTenths > 0 ? timeoutTenths * 100 : 7000) + 3000,
      });
      if (lane.curtainMode === 0) this.withoutCurtain.push(lane.slotId);
    }
  }

  get(slotId: string): Lane | undefined {
    return this.lanes.get(slotId);
  }

  boards(): number[] {
    return Array.from(new Set(Array.from(this.lanes.values(), (lane) => lane.board))).sort();
  }

  all(): Lane[] {
    return Array.from(this.lanes.values());
  }
}
