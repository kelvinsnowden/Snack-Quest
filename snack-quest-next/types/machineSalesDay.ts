import type { Timestamp } from 'firebase/firestore';
import type { MachineTransaction } from './machineTransaction';

/** Bumped when the shape changes: a summary of any other version is rebuilt from the sales rather than read. */
export const MACHINE_SALES_DAY_VERSION = 1;

/** One product's completed sales on one machine-day, summed. Money in whole shillings. */
export interface SoldProductTotals {
  productId: string;
  productCatalogue: MachineTransaction['productCatalogue'];
  units: number;
  /** What customers paid. */
  grossKes: number;
  /** The sales whose own record says what the owner paid per unit, and that cost summed. */
  ownerCosted: { units: number; grossKes: number; costKes: number };
  /**
   * Sales from before costs were recorded on each sale. They are costed when
   * read, at the snack's cost then — the same "costed at today's price"
   * estimate the per-sale P&L makes — so they are kept apart here.
   */
  legacy: { units: number; grossKes: number };
  /** Business-clock hour (`"0"`–`"23"`) → `[units, grossKes]`. Only hours with a sale. */
  byHour: Record<string, [number, number]>;
}

/**
 * `machineSalesDaily/{machineId}__{date}` — one machine's completed customer
 * sales on one Nairobi day, summed by product, for the owner's profit page.
 *
 * Written only for a day that has ended, and never changed after: a sale
 * becomes `dispensed` with the server's clock as its `dispensedAt`, and
 * `dispensed` is final, so once a day is over no sale can join it or leave
 * it. That is what makes a summary built the first time a day is needed as
 * good as the sales themselves — no schedule keeps it fresh because nothing
 * can make it stale. A day still in progress is always read from the sales.
 *
 * Every day is written, sales or not, so a quiet day is one small read
 * rather than a fresh look at the sales each time.
 */
export interface MachineSalesDay {
  businessId: string;
  machineId: string;
  /** Nairobi date, `YYYY-MM-DD`. */
  date: string;
  version: number;
  /** Keyed `${productCatalogue}__${productId}`. */
  products: Record<string, SoldProductTotals>;
  builtAt: Timestamp;
}

export function machineSalesDayDocId(machineId: string, date: string): string {
  return `${machineId}__${date}`;
}
