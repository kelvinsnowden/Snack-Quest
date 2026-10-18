#!/usr/bin/env node
/**
 * A TCP proxy that holds every chunk for DELAY_MS in each direction, so a
 * local server talking to the Firestore emulator pays a realistic network
 * round trip (2 × DELAY_MS) on every request, as it does in production.
 *
 *   node scripts/perf/latencyProxy.mjs <listenPort> <targetHost:targetPort> <delayMsEachWay>
 *
 * Order is preserved (the delay is constant), and HTTP/2 multiplexing still
 * works: parallel requests overlap, sequential ones add up — which is the
 * difference this harness exists to show.
 */
import net from 'node:net';

const [listenPort, target, delayArg] = process.argv.slice(2);
const [targetHost, targetPort] = target.split(':');
const delay = Number(delayArg);

function pipeDelayed(from, to) {
  from.on('data', (chunk) => setTimeout(() => to.writable && to.write(chunk), delay));
  from.on('end', () => setTimeout(() => to.end(), delay));
  from.on('error', () => to.destroy());
}

net
  .createServer((client) => {
    const upstream = net.connect(Number(targetPort), targetHost);
    pipeDelayed(client, upstream);
    pipeDelayed(upstream, client);
  })
  .listen(Number(listenPort), '127.0.0.1', () => console.log(`latency proxy :${listenPort} → ${target}, +${delay} ms each way`));
