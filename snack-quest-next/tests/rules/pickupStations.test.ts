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
 * Behavioral assertions for the Jumia pickup station rules: `pickupStations`
 * (public-read-if-active/admin-write, same shape as `packages`) and
 * `deliveryZoneRules` (admin-only, since it's the pricing input).
 */

let testEnv: RulesTestEnvironment;

const CUSTOMER_UID = 'customer-1';

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-project-pickup-stations',
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

describe('pickupStations security rules', () => {
  it('lets anyone signed in read an active station', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'pickupStations', 'station-1'), {
        name: 'G4S Kasarani Station',
        county: 'Nairobi',
        isActive: true,
      });
    });
    const ctx = testEnv.authenticatedContext(CUSTOMER_UID, { roles: ['customer'] });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'pickupStations', 'station-1')));
  });

  it('blocks reading an inactive station by a non-admin', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'pickupStations', 'station-1'), {
        name: 'G4S Kasarani Station',
        county: 'Nairobi',
        isActive: false,
      });
    });
    const ctx = testEnv.authenticatedContext(CUSTOMER_UID, { roles: ['customer'] });
    await assertFails(getDoc(doc(ctx.firestore(), 'pickupStations', 'station-1')));
  });

  it('lets an admin read an inactive station', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'pickupStations', 'station-1'), {
        name: 'G4S Kasarani Station',
        county: 'Nairobi',
        isActive: false,
      });
    });
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'] });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'pickupStations', 'station-1')));
  });

  it('blocks a non-admin from writing a station', async () => {
    const ctx = testEnv.authenticatedContext(CUSTOMER_UID, { roles: ['customer'] });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'pickupStations', 'station-1'), {
        name: 'G4S Kasarani Station',
        isActive: true,
      }),
    );
  });

  it('lets an admin write a station', async () => {
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'] });
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'pickupStations', 'station-1'), {
        name: 'G4S Kasarani Station',
        isActive: true,
      }),
    );
  });
});

describe('deliveryZoneRules security rules', () => {
  it('blocks a non-admin from reading a zone rule', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'deliveryZoneRules', 'zone-1'), {
        zone: 'Nairobi',
        feeKes: null,
      });
    });
    const ctx = testEnv.authenticatedContext(CUSTOMER_UID, { roles: ['customer'] });
    await assertFails(getDoc(doc(ctx.firestore(), 'deliveryZoneRules', 'zone-1')));
  });

  it('lets an admin read a zone rule', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'deliveryZoneRules', 'zone-1'), {
        zone: 'Nairobi',
        feeKes: null,
      });
    });
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'] });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'deliveryZoneRules', 'zone-1')));
  });

  it('blocks a non-admin from writing a zone rule', async () => {
    const ctx = testEnv.authenticatedContext(CUSTOMER_UID, { roles: ['customer'] });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'deliveryZoneRules', 'zone-1'), {
        zone: 'Nairobi',
        feeKes: 250,
      }),
    );
  });

  it('lets an admin write a zone rule', async () => {
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'] });
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'deliveryZoneRules', 'zone-1'), {
        zone: 'Nairobi',
        feeKes: 250,
      }),
    );
  });
});
