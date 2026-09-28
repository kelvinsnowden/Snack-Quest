import { vi, type Mock } from 'vitest';

/**
 * A stand-in for `scheduledJobRunRepository` for cron route unit tests:
 * the lease is always free, and a finished run is reported to `recordMock`
 * with its job name and business — so a test can assert on the one
 * record a run produces, however the runner writes it.
 */
export function jobRunRepositoryMock(recordMock: Mock) {
  const runs = new Map<string, { businessId: string; jobName: string }>();
  return {
    record: recordMock,
    start: vi.fn(async (businessId: string, jobName: string) => {
      const id = `run-${runs.size + 1}`;
      runs.set(id, { businessId, jobName });
      return id;
    }),
    finish: vi.fn(async (id: string, outcome: Record<string, unknown>) => recordMock({ ...runs.get(id), ...outcome })),
    acquireLease: vi.fn(async () => true),
    releaseLease: vi.fn(async () => undefined),
  };
}
