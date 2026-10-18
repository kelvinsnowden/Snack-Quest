import 'server-only';

import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { machineTemperatureLogRepository } from '@/repositories/machineTemperatureLogRepository';
import { closeHour, hourStart, type TemperatureLogRow } from '@/lib/vending/temperatureLog';

const HOUR_MS = 60 * 60 * 1000;

/** A machine's temperature record (`lib/vending/temperatureLog.ts`) between two times, oldest first, including the hour in progress. */
export async function temperatureRecord(businessId: string, machineId: string, fromMs: number, toMs: number = Date.now()): Promise<TemperatureLogRow[]> {
  const [rows, integration] = await Promise.all([
    machineTemperatureLogRepository.listRange(businessId, machineId, fromMs, toMs + HOUR_MS),
    machineIntegrationRepository.findByMachineId(businessId, machineId),
  ]);
  const open = integration?.temperatureHour;
  const inRange = (row: TemperatureLogRow) => row.hourStartMs >= hourStart(fromMs) && row.hourStartMs <= toMs;
  const all = rows.filter(inRange);
  if (open && inRange({ ...closeHour(open) }) && !all.some((row) => row.hourStartMs === open.hourStartMs)) all.push(closeHour(open));
  return all.sort((a, b) => a.hourStartMs - b.hourStartMs);
}
