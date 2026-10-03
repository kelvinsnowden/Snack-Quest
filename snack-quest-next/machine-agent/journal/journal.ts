import { open, readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DispenseOutcome } from '../m109e/outcomeMapper';

/**
 * The agent's memory across crashes and reboots: a write-ahead journal.
 *
 * Every state change of a command is appended — and flushed to disk —
 * *before* the action it describes. Above all, `run_pending` is on disk
 * before a motor-run frame is written to the serial line, so after any
 * crash the agent knows a motor may have turned and will never turn it
 * again for that command. The outcome report owed to Snack Quest is also
 * kept here (the outbox) until Snack Quest accepts it.
 *
 * Append-only JSON lines. On replay a torn last line (a crash mid-write)
 * is ignored; a damaged line anywhere else stops the agent
 * (`JournalCorruptError`) rather than letting it guess.
 */

export type OutcomeReport =
  | { status: 'dispensing'; eventId: string; occurredAt: string }
  | { status: 'dispensed'; eventId: string; occurredAt: string }
  | { status: 'failed'; eventId: string; occurredAt: string; failureCode: string; failureReason: string }
  | { status: 'unknown'; eventId: string; occurredAt: string; failureReason: string }
  | { status: 'completed'; eventId: string; occurredAt: string };

export type JournalEntry =
  | { t: 'received'; commandId: string; type: string; slotId: string | null; expiresAt: string; at: number }
  | { t: 'acked'; commandId: string; at: number }
  | { t: 'ack_refused'; commandId: string; status: number; at: number }
  /** Written and flushed immediately BEFORE a motor-run frame goes on the line. */
  | { t: 'run_pending'; commandId: string; board: number; motor: number; at: number }
  | { t: 'run_started'; commandId: string; at: number }
  /** The board said, in a valid reply, that this run did not start. */
  | { t: 'run_refused'; commandId: string; reason: string; at: number }
  /** How the run ended — the board's raw reading (if any) and the outcome decided from it. Enough to rebuild the report after a crash. */
  | { t: 'result'; commandId: string; board: Record<string, unknown> | null; outcome: DispenseOutcome; at: number }
  /** The report owed to Snack Quest — the outbox entry. Its eventId never changes. */
  | { t: 'report_owed'; commandId: string; report: OutcomeReport; at: number }
  | { t: 'report_accepted'; commandId: string; eventId: string; httpStatus: number; at: number };

export type CommandPhase = 'received' | 'acked' | 'ack_refused' | 'run_pending' | 'run_started' | 'run_refused' | 'result';

export interface CommandRecord {
  commandId: string;
  type: string;
  slotId: string | null;
  expiresAt: string | null;
  phase: CommandPhase;
  board: number | null;
  motor: number | null;
  /** Set once the run's outcome is decided. */
  outcome: DispenseOutcome | null;
  /** Reports owed or sent, in order; the last one is the command's outcome. */
  reports: { report: OutcomeReport; accepted: boolean }[];
}

export interface JournalStorage {
  append(line: string): Promise<void>;
  readAll(): Promise<string>;
}

export class JournalCorruptError extends Error {
  constructor(lineNumber: number, detail: string) {
    super(`journal line ${lineNumber} is damaged (${detail}); refusing to run until a person looks at it`);
    this.name = 'JournalCorruptError';
  }
}

/** A file on the host, fsync'd after every append. */
export class FileJournalStorage implements JournalStorage {
  constructor(private readonly path: string) {}

  async append(line: string): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const handle = await open(this.path, 'a');
    try {
      await handle.write(`${line}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async readAll(): Promise<string> {
    try {
      return await readFile(this.path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
      throw error;
    }
  }
}

/** In memory — for tests. `crashMidWrite` leaves a torn last line, as a power cut during a write would. */
export class MemoryJournalStorage implements JournalStorage {
  text = '';
  async append(line: string): Promise<void> {
    this.text += `${line}\n`;
  }
  async readAll(): Promise<string> {
    return this.text;
  }
  crashMidWrite(partial = '{"t":"acked","comm'): void {
    this.text += partial;
  }
}

export class Journal {
  private readonly records = new Map<string, CommandRecord>();

  private constructor(private readonly storage: JournalStorage) {}

  /** Opens and replays the journal. */
  static async open(storage: JournalStorage): Promise<Journal> {
    const journal = new Journal(storage);
    const text = await storage.readAll();
    const lines = text.split('\n');
    const torn = !text.endsWith('\n') && text.length > 0;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line === '') continue;
      if (torn && i === lines.length - 1) continue; // crashed mid-write: this entry never completed
      let entry: JournalEntry;
      try {
        entry = JSON.parse(line) as JournalEntry;
      } catch {
        throw new JournalCorruptError(i + 1, 'not JSON');
      }
      if (!entry || typeof entry !== 'object' || typeof entry.t !== 'string' || typeof entry.commandId !== 'string') throw new JournalCorruptError(i + 1, 'not a journal entry');
      journal.apply(entry);
    }
    return journal;
  }

  /** Appends (and flushes) one entry, then applies it. Nothing is applied that isn't on disk. */
  async record(entry: JournalEntry): Promise<void> {
    await this.storage.append(JSON.stringify(entry));
    this.apply(entry);
  }

  get(commandId: string): CommandRecord | undefined {
    return this.records.get(commandId);
  }

  all(): CommandRecord[] {
    return Array.from(this.records.values());
  }

  /** Every report not yet accepted by Snack Quest, oldest first. */
  owedReports(): { commandId: string; report: OutcomeReport }[] {
    return this.all().flatMap((record) => record.reports.filter((entry) => !entry.accepted).map((entry) => ({ commandId: record.commandId, report: entry.report })));
  }

  /** The last outcome report for a command (for `reportOutcomes` answers and retransmits). */
  lastOutcome(commandId: string): OutcomeReport | null {
    const reports = this.records.get(commandId)?.reports.filter((entry) => entry.report.status !== 'dispensing') ?? [];
    return reports.length > 0 ? reports[reports.length - 1].report : null;
  }

  private apply(entry: JournalEntry): void {
    let record = this.records.get(entry.commandId);
    if (!record) {
      record = { commandId: entry.commandId, type: 'dispense', slotId: null, expiresAt: null, phase: 'received', board: null, motor: null, outcome: null, reports: [] };
      this.records.set(entry.commandId, record);
    }
    switch (entry.t) {
      case 'received':
        record.type = entry.type;
        record.slotId = entry.slotId;
        record.expiresAt = entry.expiresAt;
        break;
      case 'acked':
      case 'ack_refused':
      case 'run_started':
      case 'run_refused':
        record.phase = entry.t;
        break;
      case 'result':
        record.phase = 'result';
        record.outcome = entry.outcome;
        break;
      case 'run_pending':
        record.phase = 'run_pending';
        record.board = entry.board;
        record.motor = entry.motor;
        break;
      case 'report_owed':
        record.reports.push({ report: entry.report, accepted: false });
        break;
      case 'report_accepted': {
        const owed = record.reports.find((item) => item.report.eventId === entry.eventId);
        if (owed) owed.accepted = true;
        break;
      }
    }
  }
}
