import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { businessRepository, type BusinessInput } from '@/repositories/businessRepository';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { publishEvent } from '@/lib/events/eventBus';
import { webhookEventRepository } from '@/repositories/webhookEventRepository';
import { paymentIntentRepository } from '@/repositories/paymentIntentRepository';
import { shipmentRepository } from '@/repositories/shipmentRepository';
import { scheduledJobRunRepository } from '@/repositories/scheduledJobRunRepository';
import { operationsService } from '@/services/operationsService';

const BUSINESS_ID = 'biz-operations-service-test';

const BASE_INPUT: BusinessInput = {
  name: 'Snack Quest',
  currency: 'KES',
  whatsappPhoneNumberId: 'wa-phone-1',
  countyCoverage: ['Nairobi'],
  adminWhatsappPhone: null,
  whatsappCustomerNumber: null,
  status: 'active',
};

beforeEach(async () => {
  await Promise.all(
    [
      'businesses',
      'domainEvents',
      'webhookEvents',
      'paymentIntents',
      'shipments',
      'inventoryBatches',
      'scheduledJobRuns',
      'packages',
    ].map((name) => adminFirestore.recursiveDelete(adminFirestore.collection(name))),
  );
  await businessRepository.create(BUSINESS_ID, BASE_INPUT, 'system');
});

describe('OperationsService.getSnapshot', () => {
  it('returns a clean snapshot with zero issues when nothing has failed', async () => {
    const snapshot = await operationsService.getSnapshot(BUSINESS_ID);
    expect(snapshot.totalIssueCount).toBe(0);
    expect(snapshot.failedDomainEvents).toHaveLength(0);
    expect(snapshot.failedWebhookEvents).toHaveLength(0);
    expect(snapshot.failedPaymentIntents).toHaveLength(0);
    expect(snapshot.manualBookingShipments).toHaveLength(0);
    expect(snapshot.integrationIssues).toHaveLength(0);
  });

  it('aggregates every real failure signal into totalIssueCount', async () => {
    await publishEvent(BUSINESS_ID, 'ShipmentCreationFailed', 'order', 'order-1', { reason: 'Jumia API down' });

    await webhookEventRepository.recordIfNew({
      businessId: BUSINESS_ID,
      provider: 'daraja',
      eventKind: 'b2c_result',
      providerEventId: 'b2c-fail-1',
      payload: {},
    });
    await webhookEventRepository.markFailed(BUSINESS_ID, 'daraja', 'b2c-fail-1', 'timeout');

    const intentId = await paymentIntentRepository.create({
      businessId: BUSINESS_ID,
      conversationId: 'conv-1',
      conversationCheckoutSnapshotId: 'snap-1',
      customerId: null,
      phoneNumber: '254700000001',
      amountKes: 2500,
    });
    await paymentIntentRepository.updateStatus(intentId, 'failed');

    await shipmentRepository.create(
      {
        businessId: BUSINESS_ID,
        orderId: 'order-2',
        method: 'door',
        provider: 'bolt',
        county: 'Nairobi',
        addressText: '123 Test St',
        recipientName: 'Jane Wanjiru',
        recipientPhone: '254700000001',
        courierShipmentRef: null,
        trackingUrl: null,
      },
      'pending_manual_booking',
    );

    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', {
      consumerKey: 'k',
      consumerSecret: 's',
      shortcode: '123',
      passkey: 'p',
      callbackUrl: 'https://example.com',
      env: 'sandbox',
      lastTestStatus: 'failure',
      lastTestError: '401 Unauthorized — invalid credentials',
      lastTestedAt: null,
      enabled: true,
    });

    await scheduledJobRunRepository.record({
      businessId: BUSINESS_ID,
      jobName: 'retry-notifications',
      status: 'failed',
      durationMs: 10,
      resultSummary: null,
      error: 'boom',
    });

    const snapshot = await operationsService.getSnapshot(BUSINESS_ID);
    expect(snapshot.failedDomainEvents).toHaveLength(1);
    expect(snapshot.failedWebhookEvents).toHaveLength(1);
    expect(snapshot.failedPaymentIntents).toHaveLength(1);
    expect(snapshot.manualBookingShipments).toHaveLength(1);
    expect(snapshot.integrationIssues).toHaveLength(1);
    expect(snapshot.integrationIssues[0]).toMatchObject({ provider: 'daraja', status: 'invalid' });
    expect(snapshot.scheduledJobRuns.filter((r) => r.data.status === 'failed')).toHaveLength(1);
    expect(snapshot.totalIssueCount).toBe(6);
  });
});
