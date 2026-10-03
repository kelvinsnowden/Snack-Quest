import 'server-only';

import { machineRepository } from '@/repositories/machineRepository';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { resolveVendingProductNames } from '@/lib/vending/productNames';
import { SALE_STATUS_LABEL } from '@/lib/vending/saleStatus';
import { BUSINESS_TIME_ZONE } from '@/lib/vending/businessClock';
import type { MachineTransaction, MachineTransactionStatus } from '@/types';

/**
 * Every vending sale across the fleet, filterable by state, machine and
 * date — the list finance and support work from, and the CSV they take
 * away. Bounded pages only (the export is capped too); the rollups, not
 * this, are what totals come from.
 */

export interface SalesFilter {
  status?: MachineTransactionStatus;
  /** A machine code as people type it (e.g. SQ-MCH-000012). */
  machineCode?: string;
  /** Inclusive start day, `YYYY-MM-DD`, Nairobi time. */
  from?: string;
  /** Inclusive end day, `YYYY-MM-DD`, Nairobi time. */
  to?: string;
}

export interface SaleRow {
  id: string;
  sale: MachineTransaction;
  machineCode: string | null;
  productName: string;
}

export interface SalesPage {
  rows: SaleRow[];
  nextCursor: string | null;
  /** Set when the machine code matched no machine, so the page can say so instead of showing "no sales". */
  unknownMachineCode: string | null;
}

/** The most rows one CSV export carries — beyond this, narrow the dates. */
export const SALES_EXPORT_LIMIT = 5000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** Nairobi is UTC+3 all year (no daylight saving); a Nairobi day starts at 21:00 UTC the day before. */
const NAIROBI_OFFSET = '+03:00';

export class SalesFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SalesFilterError';
  }
}

/** A Nairobi calendar day's bounds as instants. */
export function nairobiDayRange(from?: string, to?: string): { since?: Date; until?: Date } {
  const range: { since?: Date; until?: Date } = {};
  if (from) {
    range.since = startOfNairobiDay(from, 'start');
  }
  if (to) {
    range.until = new Date(startOfNairobiDay(to, 'end').getTime() + 24 * 60 * 60 * 1000);
  }
  if (range.since && range.until && range.since >= range.until) throw new SalesFilterError('The start date is after the end date.');
  return range;
}

/** Midnight in Nairobi on a `YYYY-MM-DD` day — refusing days that don't exist (e.g. 30 February) rather than rolling them into the next month. */
function startOfNairobiDay(day: string, which: 'start' | 'end'): Date {
  if (!DAY_PATTERN.test(day)) throw new SalesFilterError(`Use a date like ${which === 'start' ? '2026-09-01' : '2026-09-30'}.`);
  const [year, month, date] = day.split('-').map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, date));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== date) {
    throw new SalesFilterError(`${day} is not a real date.`);
  }
  return new Date(`${day}T00:00:00${NAIROBI_OFFSET}`);
}

class VendingSalesService {
  async list(businessId: string, filter: SalesFilter, options: { limit?: number; cursor?: string } = {}): Promise<SalesPage> {
    const { since, until } = nairobiDayRange(filter.from, filter.to);
    let machineId: string | undefined;
    const code = filter.machineCode?.trim();
    if (code) {
      const machine = (await machineRepository.findByMachineCode(businessId, code)) ?? (code === code.toUpperCase() ? null : await machineRepository.findByMachineCode(businessId, code.toUpperCase()));
      if (!machine) {
        return { rows: [], nextCursor: null, unknownMachineCode: code };
      }
      machineId = machine.id;
    }
    const page = await machineTransactionRepository.listByBusiness(businessId, { status: filter.status, machineId, since, until, limit: options.limit ?? 50, cursor: options.cursor });
    return { rows: await this.decorate(businessId, page.transactions), nextCursor: page.nextCursor, unknownMachineCode: null };
  }

  /** The filtered sales as CSV, newest first, capped at `SALES_EXPORT_LIMIT` rows (`truncated` says whether more existed). */
  async exportCsv(businessId: string, filter: SalesFilter): Promise<{ csv: string; rowCount: number; truncated: boolean }> {
    const rows: SaleRow[] = [];
    let cursor: string | undefined;
    let truncated = false;
    for (;;) {
      const page = await this.list(businessId, filter, { limit: 500, cursor });
      rows.push(...page.rows);
      if (rows.length >= SALES_EXPORT_LIMIT) {
        truncated = rows.length > SALES_EXPORT_LIMIT || page.nextCursor !== null;
        rows.length = Math.min(rows.length, SALES_EXPORT_LIMIT);
        break;
      }
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    const header = ['Date (Nairobi)', 'Sale reference', 'Machine', 'Slot', 'Product', 'Amount (KES)', 'Status', 'Payment method', 'M-Pesa receipt', 'Delivered at (Nairobi)', 'Reason'];
    const lines = [header, ...rows.map(({ sale, machineCode, productName }) => [
      formatNairobi(sale.createdAt.toDate()),
      sale.transactionRef,
      machineCode ?? sale.machineId,
      sale.slotId,
      productName,
      String(sale.amountKes),
      SALE_STATUS_LABEL[sale.status],
      sale.paymentMethod,
      sale.paymentRef ?? '',
      sale.dispensedAt ? formatNairobi(sale.dispensedAt.toDate()) : '',
      sale.failureReason ?? '',
    ])];
    return { csv: lines.map((line) => line.map(csvCell).join(',')).join('\r\n') + '\r\n', rowCount: rows.length, truncated };
  }

  private async decorate(businessId: string, transactions: { id: string; data: MachineTransaction }[]): Promise<SaleRow[]> {
    const machineIds = [...new Set(transactions.map(({ data }) => data.machineId))];
    const [machines, names] = await Promise.all([
      Promise.all(machineIds.map((id) => machineRepository.findById(businessId, id))),
      resolveVendingProductNames(businessId, transactions.map(({ data }) => data.productId)),
    ]);
    const codes = new Map(machineIds.map((id, index) => [id, machines[index]?.machineCode ?? null]));
    return transactions.map(({ id, data }) => ({ id, sale: data, machineCode: codes.get(data.machineId) ?? null, productName: names.get(data.productId) ?? data.productId }));
  }
}

const nairobiFormat = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function formatNairobi(at: Date): string {
  return nairobiFormat.format(at).replace(',', '');
}

/**
 * One CSV cell: quoted when needed, and a leading `=`, `+`, `-` or `@`
 * neutralised so a spreadsheet never runs text from a sale (a failure
 * reason a machine reported, say) as a formula.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const vendingSalesService = new VendingSalesService();
export { VendingSalesService };
