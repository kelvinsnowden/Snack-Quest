import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { scheduledJobRunRepository } from '@/repositories/scheduledJobRunRepository';

const BUSINESS_ID = 'biz-scheduled-job-run-repo-test';
const OTHER_BUSINESS_ID = 'biz-scheduled-job-run-repo-other';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('scheduledJobRuns'));
});

describe('ScheduledJobRunRepository', () => {
  it('records a run and lists it back, newest first', async () => {
    await scheduledJobRunRepository.record({
      businessId: BUSINESS_ID,
      jobName: 'retry-notifications',
      status: 'succeeded',
      durationMs: 120,
      resultSummary: { attempted: 2 },
      error: null,
    });
    await scheduledJobRunRepository.record({
      businessId: BUSINESS_ID,
      jobName: 'retry-notifications',
      status: 'failed',
      durationMs: 30,
      resultSummary: null,
      error: 'Firestore unavailable',
    });

    const runs = await scheduledJobRunRepository.listRecent(BUSINESS_ID);
    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.data.status)).toEqual(['failed', 'succeeded']);
    expect(runs[0].data.error).toBe('Firestore unavailable');
    expect(runs.every((r) => r.data.startedAt)).toBe(true);
  });

  it('never leaks another business\'s job runs', async () => {
    await scheduledJobRunRepository.record({
      businessId: OTHER_BUSINESS_ID,
      jobName: 'retry-notifications',
      status: 'succeeded',
      durationMs: 50,
      resultSummary: null,
      error: null,
    });

    const runs = await scheduledJobRunRepository.listRecent(BUSINESS_ID);
    expect(runs).toHaveLength(0);
  });
});
