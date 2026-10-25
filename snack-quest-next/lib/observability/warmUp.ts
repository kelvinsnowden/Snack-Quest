import 'server-only';

import { adminAuth, adminFirestore } from '@/lib/firebase/admin';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { logger } from '@/lib/observability/logger';

let warming: Promise<{ firestoreMs: number; authMs: number }> | null = null;

/**
 * Pays a new server's one-off costs before a visitor has to: Firestore's
 * client and connection (~0.8 s measured from Vercel's cpt1 on a fresh
 * server) and Firebase Auth's credentials and connection (~1.4 s fresh).
 * Started, not awaited, when the server boots (`instrumentation.ts`), so it
 * runs while the first request's page code is still loading; the request's
 * own reads then find both ready. Once per server; later calls share it.
 */
export function warmUp(): Promise<{ firestoreMs: number; authMs: number }> {
  warming ??= (async () => {
    const started = performance.now();
    const [firestoreMs, authMs] = await Promise.all([
      adminFirestore
        .collection('businesses')
        .doc(getCurrentBusinessId())
        .get()
        .then(() => Math.round(performance.now() - started)),
      // An account that can't exist: the answer is "not found", but getting it sets up the credentials and connection every session check uses.
      adminAuth
        .getUser('warm-up-no-such-user')
        .then(
          () => Math.round(performance.now() - started),
          () => Math.round(performance.now() - started),
        ),
    ]);
    return { firestoreMs, authMs };
  })().catch((error) => {
    warming = null;
    logger.warn('server warm-up failed; the first request pays its own set-up', { error });
    return { firestoreMs: -1, authMs: -1 };
  });
  return warming;
}
