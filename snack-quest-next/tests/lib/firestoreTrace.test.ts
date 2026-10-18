import { beforeAll, describe, expect, it } from 'vitest';
import * as firestoreModule from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { installFirestoreTrace, type FirestoreOp } from '@/lib/observability/firestoreTrace';

const ops: FirestoreOp[] = [];
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeAll(async () => {
  installFirestoreTrace(firestoreModule as unknown as Record<string, unknown>, (op) => ops.push(op));
  await adminFirestore.recursiveDelete(adminFirestore.collection('traceProbe'));
});

describe('Firestore tracer', () => {
  it('records each round trip once, with its collection and size, and leaves results untouched', async () => {
    const batch = adminFirestore.batch();
    for (const id of ['a', 'b', 'c']) batch.set(adminFirestore.collection('traceProbe').doc(id), { n: id });
    await batch.commit();
    const doc = await adminFirestore.collection('traceProbe').doc('a').get();
    const query = await adminFirestore.collection('traceProbe').where('n', 'in', ['a', 'b']).get();
    const count = await adminFirestore.collection('traceProbe').count().get();
    const both = await adminFirestore.getAll(adminFirestore.collection('traceProbe').doc('b'), adminFirestore.collection('traceProbe').doc('c'));
    await adminFirestore.runTransaction(async (tx) => {
      await tx.get(adminFirestore.collection('traceProbe').doc('c'));
    });
    await settle();

    expect(doc.data()).toEqual({ n: 'a' });
    expect(query.size).toBe(2);
    expect(count.data().count).toBe(3);
    expect(both).toHaveLength(2);
    expect(ops.map(({ kind, target, docs }) => [kind, target, docs])).toEqual([
      ['commit', 'batch', 3],
      ['get', 'traceProbe', 1],
      ['query', 'traceProbe', 2],
      ['count', 'traceProbe', 1],
      ['get', 'traceProbe', 2],
      ['txn-get', 'traceProbe', 1],
    ]);
    expect(ops.every((op) => op.ok && op.ms >= 0)).toBe(true);
  });

  it('passes a failure through to the caller unchanged', async () => {
    ops.length = 0;
    await expect(adminFirestore.collection('traceProbe').doc('nope').update({ n: 1 })).rejects.toThrow();
    await settle();
    expect(ops.at(-1)).toMatchObject({ kind: 'commit', ok: false });
  });
});
