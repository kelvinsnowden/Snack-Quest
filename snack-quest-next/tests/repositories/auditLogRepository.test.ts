import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { auditLogRepository } from '@/repositories/auditLogRepository';

const BUSINESS_ID = 'biz-audit-log-test';
const OTHER_BUSINESS_ID = 'biz-audit-log-other';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('auditLogs'));
});

describe('AuditLogRepository', () => {
  it('records an entry and lists it back newest-first, scoped per business', async () => {
    await auditLogRepository.record({
      businessId: BUSINESS_ID,
      actorId: 'staff-1',
      action: 'business_settings.update',
      entityType: 'business',
      entityId: BUSINESS_ID,
      before: { name: 'Old' },
      after: { name: 'New' },
      ipAddress: '10.0.0.1',
    });
    await auditLogRepository.record({
      businessId: OTHER_BUSINESS_ID,
      actorId: 'staff-2',
      action: 'business_settings.update',
      entityType: 'business',
      entityId: OTHER_BUSINESS_ID,
      before: null,
      after: null,
      ipAddress: '10.0.0.2',
    });

    const { logs, nextCursor } = await auditLogRepository.listByBusiness(BUSINESS_ID);

    expect(logs).toHaveLength(1);
    expect(logs[0].data.actorId).toBe('staff-1');
    expect(logs[0].data.after).toEqual({ name: 'New' });
    expect(nextCursor).toBeNull();
  });

  it('filters by entityType when given', async () => {
    await auditLogRepository.record({
      businessId: BUSINESS_ID,
      actorId: 'staff-1',
      action: 'product.create',
      entityType: 'package',
      entityId: 'pkg-1',
      before: null,
      after: { name: 'Box' },
      ipAddress: '10.0.0.1',
    });
    await auditLogRepository.record({
      businessId: BUSINESS_ID,
      actorId: 'staff-1',
      action: 'withdrawal.approve',
      entityType: 'withdrawal',
      entityId: 'w-1',
      before: null,
      after: { status: 'approved' },
      ipAddress: '10.0.0.1',
    });

    const { logs } = await auditLogRepository.listByBusiness(BUSINESS_ID, { entityType: 'withdrawal' });

    expect(logs).toHaveLength(1);
    expect(logs[0].data.entityType).toBe('withdrawal');
  });

  it('paginates via cursor when there are more entries than the page size', async () => {
    for (let i = 0; i < 3; i += 1) {
      await auditLogRepository.record({
        businessId: BUSINESS_ID,
        actorId: 'staff-1',
        action: 'product.create',
        entityType: 'package',
        entityId: `pkg-${i}`,
        before: null,
        after: null,
        ipAddress: '10.0.0.1',
      });
    }

    const firstPage = await auditLogRepository.listByBusiness(BUSINESS_ID, { limit: 2 });
    expect(firstPage.logs).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await auditLogRepository.listByBusiness(BUSINESS_ID, {
      limit: 2,
      cursor: firstPage.nextCursor!,
    });
    expect(secondPage.logs).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
  });
});
