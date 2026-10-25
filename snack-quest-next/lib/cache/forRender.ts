import 'server-only';

import { cache } from 'react';
import { partnerRepository } from '@/repositories/partnerRepository';
import { machineRepository } from '@/repositories/machineRepository';
import { machineDailySummaryRepository } from '@/repositories/machineDailySummaryRepository';

/**
 * Reads shared by everything one page render asks for. An owner page builds
 * its summary, trend, top products and cards from separate services, and
 * each used to read the same owner, the same machines and the same 30 days
 * of every machine's summaries again — four or five times per view.
 *
 * React's `cache` gives each server render its own memo, so identical calls
 * during one render share one read, and nothing is ever shared between
 * requests or users. Outside a render (route handlers, jobs, tests) every
 * call reads afresh. Only for read-only page code: a write followed by a
 * read in the same request must use the repositories directly.
 *
 * Each returns a fresh copy, so one caller sorting or editing its result
 * can't change what another caller sees.
 */
const partnerOnce = cache((businessId: string, partnerId: string) => partnerRepository.findById(businessId, partnerId));
const partnerMachinesOnce = cache((businessId: string, partnerId: string) => machineRepository.listByPartner(businessId, partnerId));
const dailySummariesOnce = cache((businessId: string, machineId: string, startDate: string, endDate: string) =>
  machineDailySummaryRepository.listRange(businessId, machineId, startDate, endDate),
);

export const forRender = {
  async partner(businessId: string, partnerId: string) {
    const partner = await partnerOnce(businessId, partnerId);
    return partner ? { ...partner } : null;
  },
  async partnerMachines(businessId: string, partnerId: string) {
    return [...(await partnerMachinesOnce(businessId, partnerId))];
  },
  async dailySummaries(businessId: string, machineId: string, startDate: string, endDate: string) {
    return new Map(await dailySummariesOnce(businessId, machineId, startDate, endDate));
  },
};
