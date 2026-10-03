import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { machineEconomicProfileService, EconomicProfileValidationError, parseCommercialTerms } from '@/services/machineEconomicProfileService';
import { priceBookService } from '@/services/priceBookService';
import { partnerService } from '@/services/partnerService';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineSettlementService } from '@/services/machineSettlementService';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';

/**
 * Ownership, the economic profile and the frozen economics of every sale
 * (§ OWNERSHIP, § HISTORICAL SNAPSHOTS, § ONE PRICE). The worked numbers are
 * the brief's: landed KES 180, owner price KES 250, retail KES 350.
 */

const BUSINESS_ID = 'biz-machine-economics';
const COLLECTIONS = ['machines', 'machineSlots', 'machineTransactions', 'machineInventoryMovements', 'machineAssortments', 'machineAssortmentPriceHistory', 'partners', 'partnerMachineAgreements', 'machineOwnershipHistory', 'productPrices', 'productPriceCurrent', 'snackItems', 'deviceCredentials', 'machineSettlements', 'machineDispenseCommands', 'machineEvents', 'machineTelemetryEvents'];

beforeEach(async () => {
  for (const collection of COLLECTIONS) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
});

async function snackAt(landed: number, wholesale: number | null) {
  const id = await snackItemRepository.create({ businessId: BUSINESS_ID, name: 'Pocky', imageUrl: null, expectedUnitCostKes: landed, unitLabel: 'box', origin: 'Japan', sourcingNote: null, isActive: true }, 'staff-1');
  if (wholesale !== null) await priceBookService.setPrice({ businessId: BUSINESS_ID, productCatalogue: 'snackItem', productId: id, priceType: 'owner_wholesale', amountKes: wholesale, reason: 'owner price list', actor: 'staff-1' });
  return id;
}

async function machineSelling(snackId: string, options: { ownerPartnerId?: string | null; priceKes?: number } = {}) {
  const adapter = new MockVendingAdapter();
  const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: `SQ-ECON-${Math.random().toString(36).slice(2, 8)}`, serialNumber: 'SN', manufacturer: 'mock', model: 'm', ownerPartnerId: options.ownerPartnerId ?? null, actor: 'staff-1' });
  adapter.seedSlot(machineId, 'A01', { quantity: 5 });
  await new MachineSlotService(() => adapter).configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: snackId, productCatalogue: 'snackItem', priceKes: options.priceKes ?? 350, capacity: 10, position: 1 });
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 5 });
  return { machineId, transactions: new MachineTransactionService(() => adapter) };
}

describe('ownership', () => {
  it('a new machine with no owner is Snack Quest’s; with an owner, a third party’s', async () => {
    const snackId = await snackAt(180, null);
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner', actor: 'staff-1' });
    const own = await machineSelling(snackId);
    const theirs = await machineSelling(snackId, { ownerPartnerId: partnerId });
    expect((await machineEconomicProfileService.resolve(BUSINESS_ID, own.machineId)).ownershipType).toBe('snack_quest');
    expect(await machineEconomicProfileService.resolve(BUSINESS_ID, theirs.machineId)).toMatchObject({ ownershipType: 'third_party', partnerId, settlesWithOwner: true, termsAreDefault: true });
  });

  it('a machine written before ownershipType existed reads by its owner field', async () => {
    const snackId = await snackAt(180, null);
    const { machineId } = await machineSelling(snackId);
    await adminFirestore.collection('machines').doc(machineId).update({ ownershipType: null });
    expect((await machineEconomicProfileService.resolve(BUSINESS_ID, machineId)).ownershipType).toBe('snack_quest');
  });

  it('a Snack Quest machine never settles and carries no owner terms', async () => {
    const snackId = await snackAt(180, null);
    const { machineId } = await machineSelling(snackId);
    expect(await machineEconomicProfileService.resolve(BUSINESS_ID, machineId)).toMatchObject({ settlesWithOwner: false, partnerId: null, terms: { inventoryOwner: 'snack_quest', adRevenueSharePartnerPct: 0 } });
  });

  it('refuses to mark a machine Snack Quest’s while it still has an owner, or franchise without one', async () => {
    const snackId = await snackAt(180, null);
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner', actor: 'staff-1' });
    const theirs = await machineSelling(snackId, { ownerPartnerId: partnerId });
    const own = await machineSelling(snackId);
    await expect(machineEconomicProfileService.setOwnershipType(BUSINESS_ID, theirs.machineId, 'snack_quest', 'staff-1')).rejects.toBeInstanceOf(EconomicProfileValidationError);
    await expect(machineEconomicProfileService.setOwnershipType(BUSINESS_ID, own.machineId, 'partner_franchise', 'staff-1')).rejects.toBeInstanceOf(EconomicProfileValidationError);
    await expect(machineEconomicProfileService.setOwnershipType(BUSINESS_ID, theirs.machineId, 'partner_franchise', 'staff-1')).resolves.toEqual({ before: 'third_party', after: 'partner_franchise' });
  });

  it('taking a machine back from its owner makes it Snack Quest’s', async () => {
    const snackId = await snackAt(180, null);
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner', actor: 'staff-1' });
    const { machineId } = await machineSelling(snackId, { ownerPartnerId: partnerId });
    await machineService.reassignOwner(BUSINESS_ID, machineId, null, 'staff-1');
    expect((await machineEconomicProfileService.resolve(BUSINESS_ID, machineId)).ownershipType).toBe('snack_quest');
  });

  it('agreement terms: validated, stored, and a missing term keeps today’s behaviour', async () => {
    expect(() => parseCommercialTerms({ ownerCostBasis: 'free' })).toThrow(EconomicProfileValidationError);
    expect(() => parseCommercialTerms({ adRevenueSharePartnerPct: 140 })).toThrow(EconomicProfileValidationError);
    const snackId = await snackAt(180, 250);
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner', actor: 'staff-1' });
    const { machineId } = await machineSelling(snackId, { ownerPartnerId: partnerId });
    await partnerService.createAgreement({ businessId: BUSINESS_ID, partnerId, machineId, status: 'active', revenueSharePartnerPct: null, operatingCostNote: null, effectiveFrom: null, documentRef: null, note: null, terms: { ownerCostBasis: 'wholesale_price', adRevenueSharePartnerPct: 40 }, actor: 'staff-1' });
    const profile = await machineEconomicProfileService.resolve(BUSINESS_ID, machineId);
    expect(profile.terms).toMatchObject({ ownerCostBasis: 'wholesale_price', adRevenueSharePartnerPct: 40, inventoryOwner: 'snack_quest', showLandedCostToOwner: false });
    expect(profile.termsAreDefault).toBe(false);
  });
});

describe('sale economics snapshot', () => {
  it('freezes retail, landed and owner price at the moment of sale; a later cost change never rewrites it', async () => {
    const snackId = await snackAt(180, 250);
    const { machineId, transactions } = await machineSelling(snackId);
    const { id } = await transactions.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await priceBookService.setPrice({ businessId: BUSINESS_ID, productCatalogue: 'snackItem', productId: snackId, priceType: 'landed_cost', amountKes: 220, reason: 'supplier raised prices', actor: 'staff-1' });
    const sale = await machineTransactionRepository.findById(BUSINESS_ID, id);
    expect(sale?.economics).toMatchObject({ retailPriceKes: 350, landedCostKes: 180, ownerWholesaleKes: 250, ownershipType: 'snack_quest', inventoryOwner: 'snack_quest' });
  });

  it('an owner machine’s sale records the owner and the agreement terms in force', async () => {
    const snackId = await snackAt(180, 250);
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner', actor: 'staff-1' });
    const { machineId, transactions } = await machineSelling(snackId, { ownerPartnerId: partnerId });
    const agreementId = await partnerService.createAgreement({ businessId: BUSINESS_ID, partnerId, machineId, status: 'active', revenueSharePartnerPct: null, operatingCostNote: null, effectiveFrom: null, documentRef: null, note: null, terms: { ownerCostBasis: 'wholesale_price', inventoryOwner: 'machine_owner' }, actor: 'staff-1' });
    const { id } = await transactions.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    expect((await machineTransactionRepository.findById(BUSINESS_ID, id))?.economics).toMatchObject({ ownershipType: 'third_party', partnerId, agreementId, ownerCostBasis: 'wholesale_price', inventoryOwner: 'machine_owner' });
  });
});

describe('one price (§ ONE PRICE)', () => {
  it('the price the screen shows is the price charged, including a machine price override', async () => {
    const snackId = await snackAt(180, 250);
    const { machineId, transactions } = await machineSelling(snackId, { priceKes: 350 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: snackId, productCatalogue: 'snackItem', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', snackId, 'A01');
    await machineAssortmentService.setPriceOverride(BUSINESS_ID, machineId, 'snackItem', snackId, 300, 'staff-1');
    const shown = (await machineAssortmentService.getSellableCatalog(BUSINESS_ID, machineId)).find((item) => item.productId === snackId);
    const { id } = await transactions.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    const charged = await machineTransactionRepository.findById(BUSINESS_ID, id);
    expect(shown?.priceKes).toBe(300);
    expect(charged?.amountKes).toBe(300);
    expect(charged?.economics?.retailPriceKes).toBe(300);
  });

  it('a product not yet in a slot shows its suggested retail price — never its cost', async () => {
    const snackId = await snackAt(180, 250);
    const { machineId } = await machineSelling(snackId);
    const other = await snackAt(90, null);
    await priceBookService.setPrice({ businessId: BUSINESS_ID, productCatalogue: 'snackItem', productId: other, priceType: 'retail_list', amountKes: 200, reason: 'suggested price', actor: 'staff-1' });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: other, productCatalogue: 'snackItem', actor: 'staff-1' });
    const shown = (await machineAssortmentService.getSellableCatalog(BUSINESS_ID, machineId)).find((item) => item.productId === other);
    expect(shown?.priceKes).toBe(200);
  });
});

describe('settlement costs sales from their snapshot', () => {
  it('owner on wholesale terms: COGS is 250 per unit even after the landed cost changes', async () => {
    const snackId = await snackAt(180, 250);
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner', actor: 'staff-1' });
    const { machineId, transactions } = await machineSelling(snackId, { ownerPartnerId: partnerId });
    await partnerService.createAgreement({ businessId: BUSINESS_ID, partnerId, machineId, status: 'active', revenueSharePartnerPct: null, operatingCostNote: null, effectiveFrom: null, documentRef: null, note: null, terms: { ownerCostBasis: 'wholesale_price' }, actor: 'staff-1' });
    const periodStart = new Date(Date.now() - 60_000);
    // A paid, dispensed sale.
    await machineService.updateStatus(BUSINESS_ID, machineId, 'installing', 'staff-1');
    await machineService.updateStatus(BUSINESS_ID, machineId, 'testing', 'staff-1');
    await machineService.updateStatus(BUSINESS_ID, machineId, 'active', 'staff-1');
    const { id } = await transactions.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await transactions.markPaymentVerified(BUSINESS_ID, id, `mpesa-${id}`);
    const { vendRef } = await transactions.authorizeVend(BUSINESS_ID, id);
    await transactions.applyVendResult({ businessId: BUSINESS_ID, machineId, rawPayload: { vendRef, dispensed: true, idempotencyKey: `r-${id}` }, source: 'mock', actor: 'device' });
    await priceBookService.setPrice({ businessId: BUSINESS_ID, productCatalogue: 'snackItem', productId: snackId, priceType: 'owner_wholesale', amountKes: 999, reason: 'later price', actor: 'staff-1' });
    const { draft } = await machineSettlementService.previewDraft({ businessId: BUSINESS_ID, machineId, partnerId, periodStart, periodEnd: new Date(Date.now() + 60_000) });
    expect(draft).toMatchObject({ grossSalesKes: 350, cogsKes: 250, distributableOwnerKes: 100, unpricedSaleCount: 0, estimatedCostSaleCount: 0 });
  });
});
