/**
 * The physical acceptance record for one M109E machine (M109E audit §10)
 * and the gate that turns it into settings.
 *
 * Nothing about the machine is assumed. A capability is declared, and a
 * safety setting is relaxed, only when every test that proves it has
 * been run on the real machine and passed — with a date, a tester and
 * evidence. Until then the agent runs with the conservative defaults
 * and the model declares nothing.
 */

export type AcceptanceSection = 'connectivity' | 'motors' | 'sensors' | 'recovery' | 'security' | 'financial';

export interface AcceptanceTest {
  id: string;
  section: AcceptanceSection;
  title: string;
}

const t = (section: AcceptanceSection, id: string, title: string): AcceptanceTest => ({ id, section, title });

/** Every test in §10, in the order they are run. */
export const ACCEPTANCE_TESTS: readonly AcceptanceTest[] = [
  t('connectivity', 'C1', 'Serial variant identified; 01H answers at 9600 8N1 with a valid CRC'),
  t('connectivity', 'C2', 'Only the configured board address(es) answer 01H'),
  t('connectivity', 'C3', 'A bad-CRC request causes no action'),
  t('connectivity', 'C4', '1,000 round-trips: 0 CRC errors, p99 < 1 s'),
  t('connectivity', 'C5', 'Data bits confirmed'),
  t('connectivity', 'C6', 'Cable pull: online:false, then recovery'),
  t('motors', 'M1', 'Every lane, stocked: Z3=0, Z10>0, exactly one product per run'),
  t('motors', 'M2', 'Every lane, empty: runs to timeout, Z3=0x03, Z10=0, nothing drops'),
  t('motors', 'M3', 'Unplugged motor: Z3=0x02, nothing moves'),
  t('motors', 'M4', 'Induced jam: Z3=0x01 or 0x03; Z10 agrees with what happened'),
  t('motors', 'M5', '05H while another motor runs: Z1=2, second motor does not move'),
  t('motors', 'M6', '05H twice without reading: Z1=3, no second rotation'),
  t('motors', 'M7', 'Invalid index (60, 99, 100): Z1=1'),
  t('motors', 'M8', '50 consecutive vends on one lane: 50 products, 50 dispensed, 0 unknown'),
  t('motors', 'M9', 'Index → physical position map signed off and matching the slot map'),
  t('sensors', 'S1', 'Curtain power and state follow'),
  t('sensors', 'S2', '0DH counter behaviour documented'),
  t('sensors', 'S3', 'Curtain self-test failure: Z3=0x04, motor did not move'),
  t('sensors', 'S4', 'Z10 within 1–200 ms for every product'),
  t('sensors', 'S5', 'Curtain reliability: ≥ 200 vends per product size, 100 % detected'),
  t('sensors', 'S6', 'No false drop with a hand in the delivery port'),
  t('sensors', 'S7', 'Result-clearing rule observed and recorded'),
  t('sensors', 'S8', 'Temperature real; −50.0 with the probe unplugged'),
  t('sensors', 'S9', 'Humidity/temperature plausible'),
  t('sensors', 'S10', 'Door input identified, or proven absent'),
  t('sensors', 'S11', 'DO outputs and power-on defaults documented'),
  t('sensors', 'S12', 'Refrigeration ownership documented'),
  t('recovery', 'R1', 'Internet down during a vend: one product, outcome delivered later'),
  t('recovery', 'R2', 'Snack Quest unreachable: as R1, no execution without ack'),
  t('recovery', 'R3', 'Agent killed after ack, before 05H: no run; failed; refunded'),
  t('recovery', 'R4', 'Agent killed during a run: result read or unknown; never re-run'),
  t('recovery', 'R5', 'Host reboot mid-run: as R4'),
  t('recovery', 'R6', 'Board power cut mid-run: unknown; human review'),
  t('recovery', 'R7', 'Whole-machine power cut mid-run: as R6; no second dispense'),
  t('recovery', 'R8', 'Power cut just after a drop: dispensed or unknown; never re-run'),
  t('recovery', 'R9', 'Lost 05H reply: never two rotations'),
  t('recovery', 'R10', 'Lost 03H replies: retries succeed; no duplicate run'),
  t('recovery', 'R11', 'Duplicate command delivery: one rotation, one report'),
  t('recovery', 'R12', 'Command expired while held: never executed'),
  t('recovery', 'R13', 'Report deferred: delivered later, counted once'),
  t('security', 'X1', 'Serial port exclusive to the agent (manufacturer app removed or disabled)'),
  t('security', 'X2', 'Malformed frames rejected and logged'),
  t('security', 'X3', 'Invalid-CRC replies rejected'),
  t('security', 'X4', 'Unsolicited bytes flushed; no action'),
  t('security', 'X5', 'Replayed signed request refused'),
  t('security', 'X6', 'Agent never sends FF (frame log)'),
  t('security', 'X7', 'Cabinet locked; no open debug ports'),
  t('security', 'X8', 'Kiosk browser locked to the machine page'),
  t('financial', 'P1', '100 sales on camera: products counted = dispensed; 0 extra drops'),
  t('financial', 'P2', 'Duplicate requests: at most one drop per order'),
  t('financial', 'P3', 'Network faults ×50: 0 double drops'),
  t('financial', 'P4', 'Every drop is eventually reconciled'),
  t('financial', 'P5', 'A failed dispense is identified and refunded'),
  t('financial', 'P6', 'Unknown outcomes land in manual review; no automatic refund'),
  t('financial', 'P7', 'Certification harness against the real machine: CERTIFIED'),
];

const KNOWN_IDS = new Set(ACCEPTANCE_TESTS.map((test) => test.id));

export interface AcceptanceResult {
  result: 'not_run' | 'passed' | 'failed';
  /** ISO date the test was run. */
  date?: string;
  /** Who ran it. */
  tester?: string;
  /** Where the evidence is: frame logs, video, counts. */
  evidence?: string;
  notes?: string;
}

export interface AcceptanceRecord {
  machine: { model: string; boardIdHex: string | null; hostDescription: string | null; firmwareVersion: string | null };
  /** What the tests found, where a test's answer is a fact rather than pass/fail. */
  findings: {
    /** S7: how the board clears a finished result. */
    resultClearing: 'until_read' | 'until_next_run' | 'timer' | 'unknown';
    /** S10: the DI input wired to the door, or null if there is none. */
    doorInput: 1 | 2 | 3 | 4 | null;
  };
  results: Record<string, AcceptanceResult>;
}

export class AcceptanceRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AcceptanceRecordError';
  }
}

/** An empty record: every test not run, nothing found. */
export function blankAcceptanceRecord(model: string): AcceptanceRecord {
  return {
    machine: { model, boardIdHex: null, hostDescription: null, firmwareVersion: null },
    findings: { resultClearing: 'unknown', doorInput: null },
    results: Object.fromEntries(ACCEPTANCE_TESTS.map((test) => [test.id, { result: 'not_run' }])),
  };
}

/** Refuses a record that claims a result it can't back: unknown test ids, or a pass/fail without date, tester and evidence. */
export function validateAcceptanceRecord(record: AcceptanceRecord): void {
  for (const [id, entry] of Object.entries(record.results)) {
    if (!KNOWN_IDS.has(id)) throw new AcceptanceRecordError(`unknown acceptance test "${id}"`);
    if (!['not_run', 'passed', 'failed'].includes(entry.result)) throw new AcceptanceRecordError(`${id}: result must be not_run, passed or failed`);
    if (entry.result !== 'not_run') {
      if (!entry.date || Number.isNaN(Date.parse(entry.date))) throw new AcceptanceRecordError(`${id}: a ${entry.result} result needs the date it was run`);
      if (!entry.tester?.trim()) throw new AcceptanceRecordError(`${id}: a ${entry.result} result needs the tester's name`);
      if (!entry.evidence?.trim()) throw new AcceptanceRecordError(`${id}: a ${entry.result} result needs evidence (frame log, video, counts)`);
    }
  }
  if (record.findings.resultClearing !== 'unknown' && record.results.S7?.result !== 'passed') {
    throw new AcceptanceRecordError('findings.resultClearing is set but S7 has not passed');
  }
  if (record.findings.doorInput !== null && record.results.S10?.result !== 'passed') {
    throw new AcceptanceRecordError('findings.doorInput is set but S10 has not passed');
  }
}

/** Each capability the model may declare, and the tests that must all have passed first. */
export const CAPABILITY_EVIDENCE: Readonly<Record<string, readonly string[]>> = {
  vend: ['C1', 'C4', 'M1', 'M5', 'M6', 'M8', 'M9', 'R9', 'R10'],
  dispense_confirmation: ['M1', 'M2', 'S1', 'S3', 'S4', 'S5', 'S6'],
  heartbeat: ['C1', 'C6'],
  telemetry: ['C4', 'C6'],
  faults: ['M2', 'M3', 'M4', 'S3'],
  temperature: ['S8'],
  door_status: ['S10'],
};

/**
 * Never declared for the M109E, whatever the tests say: the controller
 * can't do them (M109E audit §8.1 F).
 */
export const IMPOSSIBLE_CAPABILITIES: readonly string[] = ['inventory_read', 'inventory_write', 'slot_read', 'audit_export', 'payment_device'];

/** Tests that must pass before a machine of this model may take real money. */
export const PRODUCTION_GATE: readonly string[] = ['S5', 'S7', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'X1', 'X6', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];

export interface GateResult {
  /** Capabilities the model may declare in Snack Quest's registry. */
  declaredCapabilities: string[];
  /** Capabilities held back, with the tests still missing. */
  withheld: { capability: string; missing: string[] }[];
  /** The agent's safety settings, relaxed only by passed tests. */
  agent: { curtainNegativeIsCertain: boolean; resultsPersistUntilRead: boolean; doorInput: 1 | 2 | 3 | 4 | null };
  /** Production-gate tests not yet passed. Empty means the gate is met — not that the machine is production-ready by itself. */
  productionBlockers: string[];
  /** Tests that were run and failed. */
  failed: string[];
}

export function capabilityGate(record: AcceptanceRecord): GateResult {
  validateAcceptanceRecord(record);
  const passed = (id: string) => record.results[id]?.result === 'passed';
  const declaredCapabilities: string[] = [];
  const withheld: GateResult['withheld'] = [];
  for (const [capability, tests] of Object.entries(CAPABILITY_EVIDENCE)) {
    const missing = tests.filter((id) => !passed(id));
    if (capability === 'door_status' && record.findings.doorInput === null && missing.length === 0) {
      withheld.push({ capability, missing: ['S10 found no door input'] });
    } else if (missing.length === 0) {
      declaredCapabilities.push(capability);
    } else {
      withheld.push({ capability, missing });
    }
  }
  return {
    declaredCapabilities,
    withheld,
    agent: {
      curtainNegativeIsCertain: passed('S3') && passed('S5'),
      resultsPersistUntilRead: passed('S7') && record.findings.resultClearing === 'until_read',
      doorInput: passed('S10') ? record.findings.doorInput : null,
    },
    productionBlockers: PRODUCTION_GATE.filter((id) => !passed(id)),
    failed: ACCEPTANCE_TESTS.filter((test) => record.results[test.id]?.result === 'failed').map((test) => test.id),
  };
}
