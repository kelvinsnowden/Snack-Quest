/**
 * The measurement dataset: a business the size Snack Quest expects soon,
 * written into the Firestore emulator so page loads can be timed and their
 * reads counted (scripts/perf/README.md).
 *
 * 20 machines (two owners with 5 each, 10 Snack Quest's), 30 slots each,
 * 150 snack items, 90 days of daily rollups, 20,000 sales, 60 days of
 * traffic, 200 pending recommendations, 40 open alerts, restocks, a
 * technician's job history, settlements and withdrawals. Writes the
 * session cookies for a super admin, an owner and a technician to
 * PERF_COOKIES_FILE.
 *
 * Run through scripts/perf/vitest.config.ts (it needs the app's path
 * aliases and the emulator), never against a real project.
 */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminFirestore } from '@/lib/firebase/admin';
import { userRepository } from '@/repositories/userRepository';
import { staffRepository } from '@/repositories/staffRepository';
import { machineService } from '@/services/machineService';
import { partnerService } from '@/services/partnerService';
import { partnerAuthService } from '@/services/partnerAuthService';
import { staffAuthService } from '@/services/staffAuthService';
import { trafficDailyRepository } from '@/repositories/trafficDailyRepository';
import { machineDailySummaryDocId } from '@/types/machineDailySummary';
import { partnerDailySummaryDocId } from '@/types/partnerDailySummary';
import { networkDailySummaryDocId } from '@/types/networkDailySummary';
import { getIdTokenForUid } from '../../tests/helpers/authEmulator';

const B = process.env.SNACK_QUEST_BUSINESS_ID ?? 'biz-perf';
const DAY = 86_400_000;
const now = Date.now();
const dateKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const ts = (ms: number) => Timestamp.fromMillis(ms);

async function writeAll(docs: { path: string; data: Record<string, unknown> }[]) {
  for (let i = 0; i < docs.length; i += 450) {
    const batch = adminFirestore.batch();
    for (const { path, data } of docs.slice(i, i + 450)) batch.set(adminFirestore.doc(path), data);
    await batch.commit();
  }
}

it('seeds the measurement dataset', async () => {
  // People.
  const admin = await adminAuth.createUser({ email: 'perf-admin@example.com', password: 'perf-password-123' });
  await userRepository.create(admin.uid, { email: 'perf-admin@example.com', roles: ['super_admin'], displayName: 'Perf Admin', photoURL: null }, 'system');
  await staffRepository.create(admin.uid, { businessId: B, role: 'super_admin', permissions: [], department: 'Ops' }, 'system');
  const tech = await adminAuth.createUser({ email: 'perf-tech@example.com', password: 'perf-password-123' });
  await userRepository.create(tech.uid, { email: 'perf-tech@example.com', roles: ['warehouse'], displayName: 'Wanjiru Tech', photoURL: null }, 'system');
  await staffRepository.create(tech.uid, { businessId: B, role: 'warehouse', permissions: [], department: 'Ops' }, 'system');
  await adminFirestore.collection('businesses').doc(B).set({ name: 'Snack Quest (perf)', slug: B, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  const owners: string[] = [];
  for (const [name, email] of [['Grace Akinyi', 'perf-owner@example.com'], ['Brian Otieno', 'perf-owner2@example.com']]) {
    owners.push(await partnerService.create({ businessId: B, name, contactEmail: email, actor: 'system' }));
  }
  const ownerUser = await adminAuth.createUser({ email: 'perf-owner@example.com', password: 'perf-password-123' });

  // Catalogue.
  const products = Array.from({ length: 150 }, (_, i) => ({ id: `snack-${String(i).padStart(3, '0')}`, name: `Snack ${i}`, category: ['Chips', 'Chocolate', 'Drinks', 'Candy', 'Biscuits'][i % 5] }));
  await writeAll(products.map((p) => ({ path: `snackItems/${p.id}`, data: { businessId: B, name: p.name, category: p.category, imageUrl: null, active: true, expectedUnitCostKes: 60, retailPriceKes: 150, createdAt: ts(now - 120 * DAY), updatedAt: ts(now - 10 * DAY) } })));

  // Machines, places, slots, assortment.
  const machines: { id: string; code: string; owner: string | null }[] = [];
  for (let m = 0; m < 20; m += 1) {
    const location = await adminFirestore.collection('locations').add({ businessId: B, name: `Site ${m}`, address: `Road ${m}, Nairobi`, city: 'Nairobi', area: null, locationType: 'mall', latitude: -1.28 + m * 0.005, longitude: 36.8 + m * 0.004, createdAt: ts(now - 100 * DAY), updatedAt: ts(now - 100 * DAY) });
    const owner = m < 5 ? owners[0] : m < 10 ? owners[1] : null;
    const { machineId, machineCode } = await machineService.provisionDevice({ businessId: B, machineCode: `SQ-${String(m + 1).padStart(3, '0')}`, serialNumber: `SN-PERF-${m}`, manufacturer: 'mock', model: 'perf', actor: 'system' });
    await adminFirestore.collection('machines').doc(machineId).update({ locationId: location.id, status: 'active', ownerPartnerId: owner, ownershipType: owner ? 'third_party' : 'snack_quest', lastSeenAt: ts(now - 60_000) });
    machines.push({ id: machineId, code: machineCode, owner });
    const slotDocs = [];
    for (let s = 0; s < 30; s += 1) {
      const code = `${String.fromCharCode(65 + Math.floor(s / 10))}${String((s % 10) + 1).padStart(2, '0')}`;
      const product = products[(m * 7 + s) % products.length];
      slotDocs.push({ path: `machineSlots/${machineId}__${code}`, data: { businessId: B, machineId, slotCode: code, productId: product.id, productCatalogue: 'snackItem', priceKes: 150, capacity: 10, currentQuantity: (m + s) % 11, enabled: true, position: s + 1, createdAt: ts(now - 90 * DAY), updatedAt: ts(now - DAY) } });
      slotDocs.push({ path: `machineAssortments/${machineId}__snackItem__${product.id}`, data: { businessId: B, machineId, productId: product.id, productCatalogue: 'snackItem', assorted: true, slotCode: code, displayOrder: s, category: product.category, customerFacingName: null, customerFacingDescription: null, customerFacingImageUrl: null, priceOverrideKes: null, promotionalState: 'none', effectiveFrom: null, effectiveTo: null, visible: true, createdAt: ts(now - 90 * DAY), updatedAt: ts(now - DAY) } });
    }
    await writeAll(slotDocs);
  }

  // 90 days of rollups per machine, per owner and for the network.
  const rollups = [];
  for (let d = 1; d <= 90; d += 1) {
    const date = dateKey(now - d * DAY);
    let network = 0;
    const perOwner = new Map<string, number>();
    for (const [index, machine] of machines.entries()) {
      const units = 8 + ((index + d) % 9);
      const gross = units * 150;
      network += gross;
      if (machine.owner) perOwner.set(machine.owner, (perOwner.get(machine.owner) ?? 0) + gross);
      const byProduct: Record<string, unknown> = {};
      for (let k = 0; k < 10; k += 1) byProduct[products[(index * 7 + k) % products.length].id] = { unitsSold: 1, grossSalesKes: 150, cogsKes: 60, grossProfitKes: 90, category: products[(index * 7 + k) % products.length].category };
      rollups.push({ path: `machineDailySummary/${machineDailySummaryDocId(machine.id, date)}`, data: { businessId: B, machineId: machine.id, date, transactionCount: units + 1, dispensedCount: units, paidVendFailedCount: 0, grossSalesKes: gross, refundsKes: 0, unitsSold: units, averageOrderValueKes: 150, byProduct, unpricedUnitsSold: 0, stockoutProductIds: [], heartbeatCount: 288, faultCount: d % 30 === 0 ? 1 : 0, rebuiltAt: ts(now) } });
    }
    for (const [partnerId, gross] of perOwner) rollups.push({ path: `partnerDailySummary/${partnerDailySummaryDocId(partnerId, date)}`, data: { businessId: B, partnerId, date, machineCount: 5, transactionCount: gross / 150, dispensedCount: gross / 150, grossSalesKes: gross, refundsKes: 0, faultCount: 0, rebuiltAt: ts(now) } });
    rollups.push({ path: `networkDailySummary/${networkDailySummaryDocId(B, date)}`, data: { businessId: B, date, machineCount: 20, transactionCount: network / 150, dispensedCount: network / 150, grossSalesKes: network, refundsKes: 0, unitsSold: network / 150, cogsKes: (network / 150) * 60, grossProfitKes: (network / 150) * 90, unpricedUnitsSold: 0, faultCount: 0, stockoutSnapshotCount: 0, byCategory: { Chips: { unitsSold: network / 300, grossSalesKes: network / 2, cogsKes: (network / 300) * 60, grossProfitKes: (network / 300) * 90 }, Drinks: { unitsSold: network / 300, grossSalesKes: network / 2, cogsKes: (network / 300) * 60, grossProfitKes: (network / 300) * 90 } }, rebuiltAt: ts(now) } });
  }
  await writeAll(rollups);

  // 20,000 sales over 90 days.
  const sales = [];
  for (let i = 0; i < 20_000; i += 1) {
    const machine = machines[i % machines.length];
    const at = now - Math.floor((i / 20_000) * 90 * DAY) - (i % 97) * 60_000;
    const product = products[(i * 13) % products.length];
    const status = i % 200 === 0 ? 'paid_vend_failed' : i % 150 === 0 ? 'payment_failed' : 'dispensed';
    sales.push({ path: `machineTransactions/perf-tx-${i}`, data: { businessId: B, machineId: machine.id, slotId: 'A01', productId: product.id, productCatalogue: 'snackItem', transactionRef: `perf-tx-${i}`, paymentRef: `QK${i}`, checkoutRequestId: `ws_CO_perf_${i}`, merchantRequestId: null, vendRef: null, amountKes: 150, currency: 'KES', paymentMethod: 'mpesa_stk', status, paidAt: status === 'payment_failed' ? null : ts(at + 20_000), dispensedAt: status === 'dispensed' ? ts(at + 30_000) : null, failureReason: null, dispenseFailureStatus: null, appliedTelemetryEventId: null, createdAt: ts(at), updatedAt: ts(at + 30_000) } });
  }
  await writeAll(sales);

  // Traffic for the admin home: 60 days, one visitor shard each.
  for (let d = 1; d <= 60; d += 1) {
    const ids = Array.from({ length: 300 }, (_, i) => `visitor-${(d * 37 + i) % 5000}`);
    await trafficDailyRepository.put(B, dateKey(now - d * DAY), { visits: 900, uniqueVisitors: ids.length, byPath: { '/': 500, '/boxes': 400 } } as never, ids);
  }

  // Recommendations, alerts, restocks, technician history, settlements, withdrawals.
  const misc = [];
  for (let i = 0; i < 200; i += 1) misc.push({ path: `intelligenceRecommendations/perf-rec-${i}`, data: { businessId: B, type: ['RESTOCK', 'PRICE_REVIEW', 'MOVE_PRODUCT', 'ASSORTMENT_CHANGE'][i % 4], target: { kind: 'machine', id: machines[i % 20].id }, reason: 'Perf dataset', supportingMetrics: {}, confidence: 'medium', status: 'pending', actionTaken: null, actionedAt: null, actionedBy: null, outcome: null, outcomeMetrics: null, outcomeRecordedAt: null, createdAt: ts(now - (i % 30) * DAY), updatedAt: ts(now - (i % 30) * DAY) } });
  for (let i = 0; i < 40; i += 1) misc.push({ path: `alerts/perf-alert-${i}`, data: { businessId: B, type: ['stockout', 'machine_offline', 'stockout_risk', 'machine_fault'][i % 4], severity: i % 3 === 0 ? 'critical' : 'warning', machineId: machines[i % 20].id, locationId: null, title: 'Perf alert', detail: 'Perf dataset', dedupeKey: `perf-${i}`, status: 'open', assignee: null, resolution: null, resolvedAt: null, resolvedBy: null, createdAt: ts(now - i * 3_600_000), updatedAt: ts(now - i * 3_600_000) } });
  for (let i = 0; i < 300; i += 1) {
    const machine = machines[i % 20];
    const open = i >= 280;
    const status = open ? ['approved', 'picking', 'in_transit', 'draft'][i % 4] : 'received';
    misc.push({ path: `restockTasks/perf-restock-${i}`, data: { businessId: B, machineId: machine.id, warehouseId: null, items: [{ slotId: 'A01', productId: products[i % 150].id, quantityNeeded: 6, quantityDispatched: open ? null : 6, quantityReceived: open ? null : 6, discrepancyQuantity: open ? null : 0, batchId: null, expiresAt: null }], status, priority: 'normal', pickedBy: null, pickedAt: null, dispatchedBy: null, dispatchedAt: null, receivedBy: null, completedAt: open ? null : ts(now - (300 - i) * 7_200_000), discrepancyNote: null, note: null, createdAt: ts(now - (300 - i) * 7_200_000), updatedAt: ts(now - (300 - i) * 7_200_000), createdBy: 'system', updatedBy: 'system' } });
    misc.push({ path: `technicianJobs/restock_perf-restock-${i}`, data: { businessId: B, kind: 'restock', refId: `perf-restock-${i}`, machineId: machine.id, assigneeUid: tech.uid, assigneeName: 'Wanjiru Tech', status: open ? 'assigned' : 'done', checklist: [{ label: 'Clean the delivery port', done: !open, doneAt: null, doneBy: null }], note: null, assignedBy: 'system', assignedAt: ts(now - (300 - i) * 7_200_000), completedAt: open ? null : ts(now - (300 - i) * 7_000_000), completedBy: open ? null : tech.uid } });
  }
  for (const [index, machine] of machines.entries()) {
    if (!machine.owner) continue;
    for (let p = 0; p < 3; p += 1) misc.push({ path: `machineSettlements/perf-settlement-${index}-${p}`, data: { businessId: B, machineId: machine.id, partnerId: machine.owner, agreementId: null, periodStart: ts(now - (p + 1) * 30 * DAY), periodEnd: ts(now - p * 30 * DAY), status: 'paid', grossSalesKes: 60_000, refundsKes: 0, failedVendRefundsKes: 0, outcomeConflictCount: 0, operatingCostsKes: 5_000, adjustmentKes: 0, adjustmentReason: null, netDistributableKes: 31_000, partnerShareKes: 25_000, businessShareKes: 6_000, distributableOwnerKes: 25_000, cogsKes: 24_000, unpricedSaleCount: 0, estimatedCostSaleCount: 0, subscriptionChargedKes: 15_000, createdAt: ts(now - p * 30 * DAY), updatedAt: ts(now - p * 30 * DAY) } });
  }
  for (let i = 0; i < 30; i += 1) misc.push({ path: `withdrawals/perf-withdrawal-${i}`, data: { businessId: B, partnerId: owners[0], amountKes: 10_000, status: i < 25 ? 'paid' : 'pending', createdAt: ts(now - i * 3 * DAY), updatedAt: ts(now - i * 3 * DAY) } });
  await writeAll(misc);

  // Sessions.
  const staffCookie = (await staffAuthService.establishSession(await getIdTokenForUid(admin.uid))).cookie;
  const techCookie = (await staffAuthService.establishSession(await getIdTokenForUid(tech.uid))).cookie;
  const ownerCookie = (await partnerAuthService.register(await getIdTokenForUid(ownerUser.uid))).cookie;
  writeFileSync(process.env.PERF_COOKIES_FILE ?? 'perf-cookies.json', JSON.stringify({ staffCookie, techCookie, ownerCookie, machines: machines.map((m) => ({ id: m.id, code: m.code, owner: m.owner })) }));
}, 600_000);
