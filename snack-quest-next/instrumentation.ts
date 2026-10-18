/**
 * Runs once when a server instance starts (Next.js instrumentation hook).
 * Installs the Firestore round-trip tracer: slow or oversized reads are
 * logged in production, and every read is recorded when `PERF_TRACE_FILE`
 * is set for a measurement run (`lib/observability/firestoreTrace.ts`).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const [{ installFirestoreTrace }, firestoreModule] = await Promise.all([import('./lib/observability/firestoreTrace'), import('firebase-admin/firestore')]);
  installFirestoreTrace(firestoreModule as unknown as Record<string, unknown>);
}
