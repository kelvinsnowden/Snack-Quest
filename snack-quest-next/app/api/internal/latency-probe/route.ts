import { adminAuth, adminFirestore } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

const PROBE = '_latencyProbe';

async function timed(run: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  try {
    await run();
  } catch {
    // An expected miss (no such user) still costs the round trip being measured.
  }
  return Math.round(performance.now() - start);
}

async function repeat(times: number, run: () => Promise<unknown>): Promise<number[]> {
  const samples: number[] = [];
  for (let i = 0; i < times; i += 1) samples.push(await timed(run));
  return samples;
}

/**
 * `GET` — network cost, measured from the region the function runs in, of
 * the calls every signed-in page makes: one Firestore document read, one
 * small query, five reads in parallel, and the Firebase Auth user lookup
 * that a session check with revocation makes. Reads a document and a
 * user that do not exist, so it returns nothing but timings.
 *
 * Preview deployments only (they sit behind Vercel Authentication);
 * production answers 404.
 */
export async function GET(): Promise<Response> {
  if (process.env.VERCEL_ENV !== 'preview') return new Response('Not found', { status: 404 });
  const doc = adminFirestore.collection(PROBE).doc('missing');
  const firstFirestoreCallMs = await timed(() => doc.get());
  const docReadMs = await repeat(5, () => doc.get());
  const smallQueryMs = await repeat(5, () => adminFirestore.collection(PROBE).limit(1).get());
  const fiveParallelReadsMs = await repeat(3, () => Promise.all(Array.from({ length: 5 }, (_, i) => adminFirestore.collection(PROBE).doc(`missing-${i}`).get())));
  const fiveSequentialReadsMs = await repeat(3, async () => {
    for (let i = 0; i < 5; i += 1) await adminFirestore.collection(PROBE).doc(`missing-${i}`).get();
  });
  const authUserLookupMs = await repeat(5, () => adminAuth.getUser('latency-probe-no-such-user'));
  return Response.json(
    { region: process.env.VERCEL_REGION ?? null, firstFirestoreCallMs, docReadMs, smallQueryMs, fiveParallelReadsMs, fiveSequentialReadsMs, authUserLookupMs },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
