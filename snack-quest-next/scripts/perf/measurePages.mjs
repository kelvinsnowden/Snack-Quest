#!/usr/bin/env node
/**
 * Loads each page of a journey list against a running server and reports,
 * per page: time to first byte, total server time, Firestore round trips,
 * documents read, and the longest chain of round trips that had to wait for
 * each other (the part network latency multiplies).
 *
 *   PERF_TRACE_FILE=... node scripts/perf/measurePages.mjs <journeys.json> <out.json> [runs]
 *
 * journeys.json: [{ "name": "...", "path": "/admin", "cookie": "name=value" }]
 * The server must run with the same PERF_TRACE_FILE (lib/observability/firestoreTrace.ts).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [journeysFile, outFile, runsArg] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://localhost:3124';
const traceFile = process.env.PERF_TRACE_FILE;
const runs = Number(runsArg ?? 5);
const journeys = JSON.parse(readFileSync(journeysFile, 'utf8'));

function opsBetween(t0, t1) {
  if (!existsSync(traceFile)) return [];
  return readFileSync(traceFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((op) => op.start >= t0 && op.start <= t1);
}

/** Longest chain of operations where each started after the previous ended. */
function sequentialDepth(ops) {
  const sorted = [...ops].sort((a, b) => a.start - b.start);
  const best = sorted.map(() => 1);
  for (let j = 0; j < sorted.length; j += 1) {
    for (let i = 0; i < j; i += 1) {
      if (sorted[j].start >= sorted[i].start + sorted[i].ms && best[i] + 1 > best[j]) best[j] = best[i] + 1;
    }
  }
  return sorted.length ? Math.max(...best) : 0;
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
};

const results = [];
for (const journey of journeys) {
  const samples = [];
  for (let run = 0; run < runs; run += 1) {
    const t0 = Date.now();
    const started = performance.now();
    const response = await fetch(`${base}${journey.path}`, { headers: { cookie: journey.cookie ?? '' }, redirect: 'manual' });
    const reader = response.body?.getReader();
    let firstByte = null;
    let bytes = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (firstByte === null) firstByte = performance.now() - started;
        if (done) break;
        bytes += value.length;
      }
    }
    const total = performance.now() - started;
    await new Promise((resolve) => setTimeout(resolve, 150));
    const ops = opsBetween(t0, Date.now());
    const byTarget = {};
    for (const op of ops) byTarget[op.target] = (byTarget[op.target] ?? 0) + op.docs;
    samples.push({ status: response.status, ttfbMs: Math.round(firstByte ?? total), totalMs: Math.round(total), bytes, roundTrips: ops.length, docsRead: ops.reduce((sum, op) => sum + op.docs, 0), sequentialDepth: sequentialDepth(ops), byTarget });
  }
  const warm = samples.slice(1);
  const summary = {
    name: journey.name,
    path: journey.path,
    status: samples[0].status,
    coldTotalMs: samples[0].totalMs,
    warmTtfbMs: median(warm.map((s) => s.ttfbMs)),
    warmTotalMs: median(warm.map((s) => s.totalMs)),
    roundTrips: median(warm.map((s) => s.roundTrips)),
    docsRead: median(warm.map((s) => s.docsRead)),
    sequentialDepth: median(warm.map((s) => s.sequentialDepth)),
    htmlKb: Math.round(samples[0].bytes / 1024),
    topCollections: Object.entries(samples.at(-1).byTarget).sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
  results.push(summary);
  console.log(`${summary.name.padEnd(34)} ${String(summary.status).padEnd(4)} ttfb ${String(summary.warmTtfbMs).padStart(5)} ms  total ${String(summary.warmTotalMs).padStart(5)} ms  trips ${String(summary.roundTrips).padStart(4)}  docs ${String(summary.docsRead).padStart(6)}  depth ${String(summary.sequentialDepth).padStart(3)}`);
}
writeFileSync(outFile, JSON.stringify({ base, runs, at: new Date().toISOString(), results }, null, 2));
