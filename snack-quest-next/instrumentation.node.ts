import { installFirestoreTrace } from './lib/observability/firestoreTrace';

/** The Node.js half of `instrumentation.ts`. */
export async function installNodeTracing(): Promise<void> {
  const firestoreModule = await import('firebase-admin/firestore');
  installFirestoreTrace(firestoreModule as unknown as Record<string, unknown>);
}
