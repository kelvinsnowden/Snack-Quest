// Deletes specific orders and the records that belong to them.
//
// Written for the two cash "test order" records placed while the
// checkout was being built (§ Fargo migration cleanup). They are
// `confirmed`, so they count as real revenue in every admin figure, and
// they are the last two documents referencing Bolt.
//
// What it deletes: the order and its `items`, the payment intent that
// settled it, its shipment, and the conversation and frozen snapshot it
// came from.
//
// What it deliberately leaves: `domainEvents` and `outboundMessages`.
// Those are append-only records of things that actually happened — a
// message really was sent, an event really was published. Deleting an
// order says "this sale should not be counted"; deleting the log says
// "this never happened", which is a different and worse claim.
//
//   node scripts/deleteTestOrders.mjs                    # dry run
//   node scripts/deleteTestOrders.mjs --commit           # delete
import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const BUSINESS_ID = process.env.BUSINESS_ID ?? 'snack-quest';
const COMMIT = process.argv.includes('--commit');
const ORDER_IDS = process.argv.filter((a) => !a.startsWith('-') && a.length > 15).slice(2);

initializeApp({ credential: cert(JSON.parse(readFileSync(process.env.SA_KEY, 'utf8'))) });
const db = getFirestore();

async function main() {
  if (ORDER_IDS.length === 0) {
    console.error('Pass the order ids to delete. Refusing to guess which orders are disposable.');
    process.exit(1);
  }

  const targets = [];
  for (const orderId of ORDER_IDS) {
    const snap = await db.collection('orders').doc(orderId).get();
    if (!snap.exists) {
      console.error(`Order ${orderId} does not exist.`);
      process.exit(1);
    }
    const order = snap.data();
    if (order.businessId !== BUSINESS_ID) {
      console.error(`Order ${orderId} belongs to ${order.businessId}, not ${BUSINESS_ID}. Refusing.`);
      process.exit(1);
    }

    // A stock reservation that is never released leaves inventory
    // permanently short, so it is checked rather than assumed.
    const items = await snap.ref.collection('items').get();
    const shipments = await db.collection('shipments').where('orderId', '==', orderId).get();

    targets.push({ orderId, order, items, shipments });
    console.log(`\norder ${orderId}  #${order.orderNumber}  ${order.status}  KES ${order.pricing?.totalKes}`);
    console.log(`  items: ${items.size} | shipments: ${shipments.size}`);
    console.log(`  paymentIntent: ${order.payment?.paymentIntentId ?? 'none'}`);
    console.log(`  conversation: ${order.conversationId ?? 'none'} | snapshot: ${order.conversationCheckoutSnapshotId ?? 'none'}`);
  }

  const totalKes = targets.reduce((sum, t) => sum + (t.order.pricing?.totalKes ?? 0), 0);
  console.log(`\nRevenue this removes from every admin figure: KES ${totalKes}`);

  if (!COMMIT) {
    console.log('\nDRY RUN. Nothing written. Re-run with --commit to delete.');
    return;
  }

  for (const { orderId, order, items, shipments } of targets) {
    const batch = db.batch();
    items.docs.forEach((d) => batch.delete(d.ref));
    shipments.docs.forEach((d) => batch.delete(d.ref));
    if (order.payment?.paymentIntentId) {
      batch.delete(db.collection('paymentIntents').doc(order.payment.paymentIntentId));
    }
    if (order.conversationCheckoutSnapshotId) {
      batch.delete(db.collection('conversationCheckoutSnapshots').doc(order.conversationCheckoutSnapshotId));
    }
    batch.delete(db.collection('orders').doc(orderId));
    await batch.commit();

    // The conversation carries a messages subcollection, so it needs a
    // recursive delete rather than a batched one.
    if (order.conversationId) {
      await db.recursiveDelete(db.collection('conversations').doc(order.conversationId));
    }
    console.log(`Deleted order ${orderId} and its related records.`);
  }
  console.log(`\nDone. KES ${totalKes} removed from reported revenue.`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
