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
 * Rules for the machine integration layer (docs/MACHINE_INTEGRATION_LAYER.md
 * §2, §10). Every collection is written only by the Admin SDK. Staff of
 * the owning business may read registry and ledger data; nobody —
 * staff, partner or anonymous — may read credentials (they hold signing
 * secrets) or the nonce ledger.
 */

let testEnv: RulesTestEnvironment;

const READABLE_BY_TENANT_ADMIN = ['manufacturers', 'machineModels', 'machineIntegrations', 'machineIntegrationIdentities', 'machineDispenseCommands', 'machineEvents'];
const NEVER_CLIENT_READABLE = ['integrationCredentials', 'integrationRequestNonces'];

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-project-machine-integration',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    for (const collection of [...READABLE_BY_TENANT_ADMIN, ...NEVER_CLIENT_READABLE]) {
      await setDoc(doc(context.firestore(), collection, 'doc-1'), { businessId: 'biz-1', secretEncrypted: 'sqs_x' });
    }
  });
});

const admin = () => testEnv.authenticatedContext('admin-1', { roles: ['admin'], businessId: 'biz-1' }).firestore();
const otherAdmin = () => testEnv.authenticatedContext('admin-2', { roles: ['admin'], businessId: 'biz-2' }).firestore();
const partner = () => testEnv.authenticatedContext('partner-user-1', { roles: ['partner'], partnerId: 'partner-1' }).firestore();

describe('machine integration security rules', () => {
  for (const collection of READABLE_BY_TENANT_ADMIN) {
    it(`${collection}: tenant admin reads, other tenants and partners do not, nobody writes`, async () => {
      await assertSucceeds(getDoc(doc(admin(), collection, 'doc-1')));
      await assertFails(getDoc(doc(otherAdmin(), collection, 'doc-1')));
      await assertFails(getDoc(doc(partner(), collection, 'doc-1')));
      await assertFails(setDoc(doc(admin(), collection, 'doc-2'), { businessId: 'biz-1' }));
    });
  }

  for (const collection of NEVER_CLIENT_READABLE) {
    it(`${collection}: no client may read or write — not even a tenant admin`, async () => {
      await assertFails(getDoc(doc(admin(), collection, 'doc-1')));
      await assertFails(getDoc(doc(partner(), collection, 'doc-1')));
      await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), collection, 'doc-1')));
      await assertFails(setDoc(doc(admin(), collection, 'doc-2'), { businessId: 'biz-1' }));
    });
  }
});
