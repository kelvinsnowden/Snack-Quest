/**
 * Runs once when a server instance starts (Next.js instrumentation hook).
 * Installs the Firestore round-trip tracer: slow or oversized reads are
 * logged in production, and every read is recorded when `PERF_TRACE_FILE`
 * is set for a measurement run (`lib/observability/firestoreTrace.ts`).
 *
 * The imports stay inside the Node.js branch: the bundler drops that
 * branch from the Edge build, which must never pull in the Admin SDK.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installNodeTracing } = await import('./instrumentation.node');
    await installNodeTracing();
  }
}
