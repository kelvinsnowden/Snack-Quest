import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';

/**
 * Behavioral assertions for the Discovery Machine fleet's rules
 * (§ RBAC foundation, docs/VENDING_FOUNDATION.md, FLEET_ARCHITECTURE_AUDIT.md
 * §Isolation: "partner A must not be able to read machine M006").
 * Every write is unconditional deny — the Admin SDK, not a client
 * session, is the only writer for the whole fleet — and every read is
 * either staff-scoped to their own tenant or partner-scoped to
 * machines that partner actually owns.
 */

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-project-vending-fleet',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

async function seedMachine(machineId: string, data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'machines', machineId), data);
  });
}

describe('machines security rules', () => {
  it('lets a tenant admin read any machine in their business', async () => {
    await seedMachine('m-1', { businessId: 'biz-1', ownerPartnerId: null, machineCode: 'SQ-M001' });
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'], businessId: 'biz-1' });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'machines', 'm-1')));
  });

  it('blocks an admin from a different business', async () => {
    await seedMachine('m-1', { businessId: 'biz-1', ownerPartnerId: null, machineCode: 'SQ-M001' });
    const ctx = testEnv.authenticatedContext('admin-2', { roles: ['admin'], businessId: 'biz-2' });
    await assertFails(getDoc(doc(ctx.firestore(), 'machines', 'm-1')));
  });

  it('lets a partner read a machine they own', async () => {
    await seedMachine('m-1', { businessId: 'biz-1', ownerPartnerId: 'partner-1', machineCode: 'SQ-M001' });
    const ctx = testEnv.authenticatedContext('partner-user-1', { roles: ['partner'], partnerId: 'partner-1' });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'machines', 'm-1')));
  });

  it('blocks partner A from reading a machine owned by partner B — the audit\'s own named case', async () => {
    await seedMachine('m-006', { businessId: 'biz-1', ownerPartnerId: 'partner-b', machineCode: 'SQ-M006' });
    const ctx = testEnv.authenticatedContext('partner-user-a', { roles: ['partner'], partnerId: 'partner-a' });
    await assertFails(getDoc(doc(ctx.firestore(), 'machines', 'm-006')));
  });

  it('blocks a partner from reading a machine with no partner owner at all (a Snack Quest-operated machine)', async () => {
    await seedMachine('m-1', { businessId: 'biz-1', ownerPartnerId: null, machineCode: 'SQ-M001' });
    const ctx = testEnv.authenticatedContext('partner-user-1', { roles: ['partner'], partnerId: 'partner-1' });
    await assertFails(getDoc(doc(ctx.firestore(), 'machines', 'm-1')));
  });

  it('blocks a signed-in user with no partner/admin role at all', async () => {
    await seedMachine('m-1', { businessId: 'biz-1', ownerPartnerId: 'partner-1', machineCode: 'SQ-M001' });
    const ctx = testEnv.authenticatedContext('random-user', { roles: ['customer'] });
    await assertFails(getDoc(doc(ctx.firestore(), 'machines', 'm-1')));
  });

  it('blocks any client write, even by an admin — the Admin SDK is the only writer', async () => {
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'], businessId: 'biz-1' });
    await assertFails(setDoc(doc(ctx.firestore(), 'machines', 'm-1'), { businessId: 'biz-1', ownerPartnerId: null }));
  });
});

describe('machineSlots / machineTransactions / machineDailySummary security rules', () => {
  it("a partner reads their own machine's slots via the machine's ownerPartnerId, not a field on the slot itself", async () => {
    await seedMachine('m-1', { businessId: 'biz-1', ownerPartnerId: 'partner-1', machineCode: 'SQ-M001' });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'machineSlots', 'm-1__A01'), { businessId: 'biz-1', machineId: 'm-1', slotCode: 'A01' });
    });
    const ctx = testEnv.authenticatedContext('partner-user-1', { roles: ['partner'], partnerId: 'partner-1' });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'machineSlots', 'm-1__A01')));
  });

  it("blocks a different partner from reading that same slot", async () => {
    await seedMachine('m-1', { businessId: 'biz-1', ownerPartnerId: 'partner-1', machineCode: 'SQ-M001' });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'machineSlots', 'm-1__A01'), { businessId: 'biz-1', machineId: 'm-1', slotCode: 'A01' });
    });
    const ctx = testEnv.authenticatedContext('partner-user-2', { roles: ['partner'], partnerId: 'partner-2' });
    await assertFails(getDoc(doc(ctx.firestore(), 'machineSlots', 'm-1__A01')));
  });

  it("a partner reads their own machine's transactions", async () => {
    await seedMachine('m-1', { businessId: 'biz-1', ownerPartnerId: 'partner-1', machineCode: 'SQ-M001' });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'machineTransactions', 'txn-1'), { businessId: 'biz-1', machineId: 'm-1', amountKes: 350 });
    });
    const ctx = testEnv.authenticatedContext('partner-user-1', { roles: ['partner'], partnerId: 'partner-1' });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'machineTransactions', 'txn-1')));
  });

  it("blocks a different partner from reading that same transaction", async () => {
    await seedMachine('m-1', { businessId: 'biz-1', ownerPartnerId: 'partner-1', machineCode: 'SQ-M001' });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'machineTransactions', 'txn-1'), { businessId: 'biz-1', machineId: 'm-1', amountKes: 350 });
    });
    const ctx = testEnv.authenticatedContext('partner-user-2', { roles: ['partner'], partnerId: 'partner-2' });
    await assertFails(getDoc(doc(ctx.firestore(), 'machineTransactions', 'txn-1')));
  });

  it("a partner reads their own machine's daily summary rollup", async () => {
    await seedMachine('m-1', { businessId: 'biz-1', ownerPartnerId: 'partner-1', machineCode: 'SQ-M001' });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'machineDailySummary', 'm-1__2024-01-01'), { businessId: 'biz-1', machineId: 'm-1', date: '2024-01-01' });
    });
    const ctx = testEnv.authenticatedContext('partner-user-1', { roles: ['partner'], partnerId: 'partner-1' });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'machineDailySummary', 'm-1__2024-01-01')));
  });

  it('blocks any client write to any of these collections', async () => {
    const adminCtx = testEnv.authenticatedContext('admin-1', { roles: ['admin'], businessId: 'biz-1' });
    await assertFails(setDoc(doc(adminCtx.firestore(), 'machineTransactions', 'txn-1'), { businessId: 'biz-1', machineId: 'm-1' }));
  });
});

describe('partnerDailySummary / partners security rules — directly keyed by partnerId', () => {
  it("a partner reads their own portfolio rollup — the '27 machines, one read' document", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'partnerDailySummary', 'partner-1__2024-01-01'), { businessId: 'biz-1', partnerId: 'partner-1', date: '2024-01-01', grossSalesKes: 1050 });
    });
    const ctx = testEnv.authenticatedContext('partner-user-1', { roles: ['partner'], partnerId: 'partner-1' });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'partnerDailySummary', 'partner-1__2024-01-01')));
  });

  it('blocks a different partner from reading it', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'partnerDailySummary', 'partner-1__2024-01-01'), { businessId: 'biz-1', partnerId: 'partner-1', date: '2024-01-01' });
    });
    const ctx = testEnv.authenticatedContext('partner-user-2', { roles: ['partner'], partnerId: 'partner-2' });
    await assertFails(getDoc(doc(ctx.firestore(), 'partnerDailySummary', 'partner-1__2024-01-01')));
  });

  it('a partner reads their own partner profile document', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'partners', 'partner-1'), { businessId: 'biz-1', name: 'Acme Distribution' });
    });
    const ctx = testEnv.authenticatedContext('partner-user-1', { roles: ['partner'], partnerId: 'partner-1' });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'partners', 'partner-1')));
  });

  it('blocks a partner from reading a different partner\'s profile document', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'partners', 'partner-1'), { businessId: 'biz-1', name: 'Acme Distribution' });
    });
    const ctx = testEnv.authenticatedContext('partner-user-2', { roles: ['partner'], partnerId: 'partner-2' });
    await assertFails(getDoc(doc(ctx.firestore(), 'partners', 'partner-1')));
  });
});

describe('staff-only vending collections — no partner read at all', () => {
  const STAFF_ONLY_COLLECTIONS = [
    'machineInventoryMovements',
    'machineTelemetryEvents',
    'machineLocationHistory',
    'restockTasks',
    'partnerMachineAgreements',
    'machineSettlements',
    'deviceCredentials',
    'cameras',
    'cameraSnapshots',
  ];

  for (const collectionName of STAFF_ONLY_COLLECTIONS) {
    it(`lets a tenant admin read ${collectionName}, but blocks a partner even for their own machine's data`, async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), collectionName, 'doc-1'), { businessId: 'biz-1', machineId: 'm-1', partnerId: 'partner-1' });
      });

      const adminCtx = testEnv.authenticatedContext('admin-1', { roles: ['admin'], businessId: 'biz-1' });
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), collectionName, 'doc-1')));

      const partnerCtx = testEnv.authenticatedContext('partner-user-1', { roles: ['partner'], partnerId: 'partner-1' });
      await assertFails(getDoc(doc(partnerCtx.firestore(), collectionName, 'doc-1')));
    });
  }
});
