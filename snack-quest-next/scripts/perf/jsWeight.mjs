// Sums the JavaScript each page's HTML makes the browser download, raw and
// gzip-compressed. Point it at a running build (`next start`).
//
//   node scripts/perf/jsWeight.mjs http://localhost:3124 results.json /admin/login /partner/login /
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const [base, out, ...paths] = process.argv.slice(2);
const results = {};
for (const path of paths) {
  const res = await fetch(base + path, { redirect: 'manual' });
  const html = await res.text();
  const srcs = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map((m) => m[1]))];
  let raw = 0;
  let gzip = 0;
  for (const src of srcs) {
    const body = Buffer.from(await (await fetch(new URL(src, base))).arrayBuffer());
    raw += body.length;
    gzip += gzipSync(body).length;
  }
  results[path] = { status: res.status, scripts: srcs.length, rawKB: Math.round(raw / 1024), gzipKB: Math.round(gzip / 1024) };
  console.log(path.padEnd(20), res.status, `${srcs.length} scripts`, `${results[path].rawKB} KB raw`, `${results[path].gzipKB} KB gzip`);
}
writeFileSync(out, JSON.stringify(results, null, 1));
