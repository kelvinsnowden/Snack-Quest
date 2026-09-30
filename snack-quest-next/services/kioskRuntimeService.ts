import 'server-only';

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { nairobiClock } from '@/lib/ads/playlist';
import { KIOSK_METRICS, type KioskDailyStat, type KioskDeviceState, type KioskMetric, type MachineServiceAttempts, type MachineServiceCode } from '@/types/kioskRuntime';

const CODES = 'machineServiceCodes';
const ATTEMPTS = 'machineServiceAttempts';
const REPORTS = 'kioskReportBatches';
const STATS = 'kioskDailyStats';
const STATES = 'kioskDeviceStates';

export const SERVICE_CODE_TTL_MS = 15 * 60 * 1000;
export const SERVICE_SESSION_MS = 15 * 60 * 1000;
export const SERVICE_MAX_FAILURES = 5;
const REPORT_BATCH_ID = /^[A-Za-z0-9_-]{8,64}$/;
/** Report batches only exist to stop a resend counting twice; after this they can be deleted (Firestore TTL on `expireAt`). */
const REPORT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export class ServiceCodeError extends Error {
  constructor(
    message: string,
    public readonly reason: 'invalid' | 'locked',
  ) {
    super(message);
    this.name = 'ServiceCodeError';
  }
}

export class KioskReportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KioskReportValidationError';
  }
}

function hashCode(salt: string, code: string): string {
  return createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

/**
 * The machine screen in the field (§ KIOSK SERVICE MODE, § KIOSK
 * OBSERVABILITY, § KIOSK ANALYTICS): one-time service codes, the screen's
 * periodic report of what it's showing and what customers did, and the
 * activity staff see per machine.
 */
class KioskRuntimeService {
  /**
   * Issues an 8-digit code for one machine, valid 15 minutes and once.
   * Any earlier unused code for the machine stops working. Only a salted
   * hash is stored; the code is returned here and never again.
   */
  async issueServiceCode(businessId: string, machineId: string, reason: string, actor: string): Promise<{ id: string; code: string; expiresAt: Date }> {
    if (!(await machineRepository.findById(businessId, machineId))) throw new MachineNotFoundError(machineId);
    const why = reason.replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!why) throw new KioskReportValidationError('Say why the technician needs service mode — it goes in the audit log.');
    const code = String(randomInt(0, 100_000_000)).padStart(8, '0');
    const salt = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + SERVICE_CODE_TTL_MS);
    const earlier = await adminFirestore.collection(CODES).where('machineId', '==', machineId).where('status', '==', 'issued').get();
    const ref = adminFirestore.collection(CODES).doc();
    const batch = adminFirestore.batch();
    for (const doc of earlier.docs) if ((doc.data() as MachineServiceCode).businessId === businessId) batch.update(doc.ref, { status: 'superseded' });
    batch.set(ref, {
      businessId,
      machineId,
      codeHash: hashCode(salt, code),
      salt,
      reason: why,
      status: 'issued',
      issuedBy: actor,
      issuedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
      usedAt: null,
    });
    await batch.commit();
    return { id: ref.id, code, expiresAt };
  }

  /**
   * The machine's screen redeems a code. Right: the code is used up and a
   * 15-minute service session starts. Wrong: counted; after five wrong
   * codes in 15 minutes the machine refuses every code until the window
   * passes — so the 8 digits can't be guessed at the screen.
   */
  async redeemServiceCode(businessId: string, machineId: string, code: unknown, now = new Date()): Promise<{ codeId: string; issuedBy: string; sessionExpiresAt: Date }> {
    if (typeof code !== 'string' || !/^\d{8}$/.test(code)) throw new ServiceCodeError('Enter the 8-digit code.', 'invalid');
    const attemptsRef = adminFirestore.collection(ATTEMPTS).doc(machineId);
    const candidates = adminFirestore.collection(CODES).where('machineId', '==', machineId).where('status', '==', 'issued');
    const outcome = await adminFirestore.runTransaction(async (tx) => {
      const [attemptsSnap, codesSnap] = await Promise.all([tx.get(attemptsRef), tx.get(candidates)]);
      const attempts = attemptsSnap.data() as MachineServiceAttempts | undefined;
      const windowOpen = attempts && attempts.businessId === businessId && now.getTime() - attempts.windowStart.toMillis() < SERVICE_CODE_TTL_MS;
      if (windowOpen && attempts.failures >= SERVICE_MAX_FAILURES) return { kind: 'locked' as const };
      const match = codesSnap.docs.find((doc) => {
        const data = doc.data() as MachineServiceCode;
        if (data.businessId !== businessId || data.expiresAt.toMillis() <= now.getTime()) return false;
        const expected = Buffer.from(data.codeHash, 'hex');
        const given = Buffer.from(hashCode(data.salt, code), 'hex');
        return expected.length === given.length && timingSafeEqual(expected, given);
      });
      if (!match) {
        tx.set(attemptsRef, { businessId, windowStart: windowOpen ? attempts.windowStart : Timestamp.fromDate(now), failures: (windowOpen ? attempts.failures : 0) + 1 });
        return { kind: 'wrong' as const };
      }
      tx.update(match.ref, { status: 'used', usedAt: FieldValue.serverTimestamp() });
      tx.delete(attemptsRef);
      return { kind: 'ok' as const, codeId: match.id, issuedBy: (match.data() as MachineServiceCode).issuedBy };
    });
    if (outcome.kind === 'locked') throw new ServiceCodeError('Too many wrong codes. Wait 15 minutes, then ask for a new code.', 'locked');
    if (outcome.kind === 'wrong') throw new ServiceCodeError('That code isn’t right, has been used, or has expired.', 'invalid');
    return { codeId: outcome.codeId, issuedBy: outcome.issuedBy, sessionExpiresAt: new Date(now.getTime() + SERVICE_SESSION_MS) };
  }

  async listServiceCodes(businessId: string, machineId: string, limit = 10): Promise<{ id: string; data: Omit<MachineServiceCode, 'codeHash' | 'salt'> }[]> {
    const snapshot = await adminFirestore.collection(CODES).where('machineId', '==', machineId).orderBy('issuedAt', 'desc').limit(limit).get();
    return snapshot.docs
      .map((doc) => ({ id: doc.id, data: doc.data() as MachineServiceCode }))
      .filter(({ data }) => data.businessId === businessId)
      .map(({ id, data }) => {
        const { codeHash: _hash, salt: _salt, ...rest } = data;
        void _hash;
        void _salt;
        return { id, data: rest };
      });
  }

  /**
   * The screen's periodic report (§ KIOSK OBSERVABILITY): what it's showing
   * (content package and menu versions, runtime state, ads cached and
   * waiting to report) and counts of what customers did since the last
   * report. A resent report (same batch id) counts once.
   */
  async recordReport(businessId: string, machineId: string, input: unknown, now = new Date()): Promise<{ duplicate: boolean }> {
    const body = (input ?? {}) as Record<string, unknown>;
    if (typeof body.batchId !== 'string' || !REPORT_BATCH_ID.test(body.batchId)) throw new KioskReportValidationError('Send a batchId (8–64 letters, digits, - or _).');
    const counts: Partial<Record<KioskMetric, number>> = {};
    const rawCounts = (body.counts ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(rawCounts)) {
      if (!(KIOSK_METRICS as readonly string[]).includes(key)) continue;
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100_000) throw new KioskReportValidationError(`${key} must be a whole number of events.`);
      if (value > 0) counts[key as KioskMetric] = value;
    }
    const text = (value: unknown) => (typeof value === 'string' ? value.slice(0, 64) : null);
    const whole = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? Math.min(value, 1_000_000) : 0);
    const date = nairobiClock(now).date;
    const batchRef = adminFirestore.collection(REPORTS).doc(createHash('sha256').update(`${machineId}\u0000${body.batchId}`).digest('hex').slice(0, 40));
    const statRef = adminFirestore.collection(STATS).doc(`${businessId}_${date}_${machineId}`);
    const stateRef = adminFirestore.collection(STATES).doc(machineId);
    return adminFirestore.runTransaction(async (tx) => {
      if ((await tx.get(batchRef)).exists) return { duplicate: true };
      tx.create(batchRef, { businessId, machineId, batchId: body.batchId, date, counts, receivedAt: FieldValue.serverTimestamp(), expireAt: Timestamp.fromMillis(now.getTime() + REPORT_RETENTION_MS) });
      if (Object.keys(counts).length > 0) {
        const fields: Record<string, unknown> = { businessId, machineId, date, updatedAt: FieldValue.serverTimestamp() };
        for (const [key, value] of Object.entries(counts)) fields[key] = FieldValue.increment(value);
        tx.set(statRef, fields, { merge: true });
      }
      tx.set(stateRef, {
        businessId,
        machineId,
        packageVersion: text(body.packageVersion),
        catalogVersion: text(body.catalogVersion),
        runtimeState: text(body.runtimeState),
        pendingAdEvents: whole(body.pendingAdEvents),
        cachedCreatives: whole(body.cachedCreatives),
        reportedAt: FieldValue.serverTimestamp(),
      });
      return { duplicate: false };
    });
  }

  /** A machine's screen activity over the last `days` Nairobi days, and what the screen last reported about itself. */
  async activity(businessId: string, machineId: string, days = 7, now = new Date()): Promise<{ totals: Partial<Record<KioskMetric, number>>; byDay: KioskDailyStat[]; device: KioskDeviceState | null }> {
    const to = nairobiClock(now).date;
    const from = nairobiClock(new Date(now.getTime() - (days - 1) * 86_400_000)).date;
    const [stats, state] = await Promise.all([
      adminFirestore.collection(STATS).where('businessId', '==', businessId).where('machineId', '==', machineId).where('date', '>=', from).where('date', '<=', to).get(),
      adminFirestore.collection(STATES).doc(machineId).get(),
    ]);
    const byDay = stats.docs.map((doc) => doc.data() as KioskDailyStat).sort((a, b) => a.date.localeCompare(b.date));
    const totals: Partial<Record<KioskMetric, number>> = {};
    for (const row of byDay) for (const metric of KIOSK_METRICS) if (row[metric]) totals[metric] = (totals[metric] ?? 0) + (row[metric] ?? 0);
    const device = state.data() as KioskDeviceState | undefined;
    return { totals, byDay, device: device && device.businessId === businessId ? device : null };
  }
}

export const kioskRuntimeService = new KioskRuntimeService();
