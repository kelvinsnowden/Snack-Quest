// Assembled-booth mockup from the rendered panels (CSS 3D, rendered with Chromium).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(ROOT, 'out');
const S = 5.2; // px per cm
const img = (n) => 'file://' + path.join(OUT, n);

// A printed face: the panel PNG includes bleed, so scale it up and offset by the bleed to show trim only.
const face = (file, w, h, bleed, extra) =>
  `width:${w * S}px;height:${h * S}px;background:url(${img(file)}) ${-bleed * S}px ${-bleed * S}px/${(w + 2 * bleed) * S}px ${(h + 2 * bleed) * S}px no-repeat;${extra}`;

function booth(rot, x) {
  const W = 80, H = 90, D = 40, POLE = 200, HW = 80, HH = 25;
  return `
  <div class="booth" style="left:${x}px;transform:rotateY(${rot}deg)">
    <!-- counter -->
    <div class="f" style="${face('front-counter.png', W, H, 1, `transform:translate3d(${-W / 2 * S}px,${-H * S}px,${(D / 2) * S}px)`)}"></div>
    <div class="f" style="${face('side-panel.png', D, H, 1, `transform:translate3d(${(W / 2 - D / 2) * S}px,${-H * S}px,0) rotateY(90deg)`)}"></div>
    <div class="f" style="${face('side-panel.png', D, H, 1, `transform:translate3d(${(-W / 2 - D / 2) * S}px,${-H * S}px,0) rotateY(-90deg)`)}"></div>
    <div class="f" style="width:${(W + 1) * S}px;height:${2.4 * S}px;background:#ece8f6;transform:translate3d(${(-W / 2 - 0.5) * S}px,${(-H - 2.4) * S}px,${(D / 2 + 0.6) * S}px)"></div>
    <!-- poles -->
    ${[-W / 2 + 3, W / 2 - 3].map((px) => `<div class="f pole" style="width:${2.2 * S}px;height:${(POLE - H) * S}px;transform:translate3d(${(px - 1.1) * S}px,${-POLE * S}px,${(-D / 2 + 4) * S}px)"></div>`).join('')}
    <!-- header -->
    <div class="f" style="${face('header.png', HW, HH, 1, `transform:translate3d(${-HW / 2 * S}px,${-(POLE + 4) * S}px,${(-D / 2 + 5.4) * S}px);box-shadow:0 0 ${8 * S}px rgba(184,232,31,.25)`)}"></div>
    <!-- table QR card on the counter -->
    <div class="f" style="${face('table-qr-card-a5.png', 21, 14.8, 0.3, `transform:translate3d(${(W / 2 - 27) * S}px,${(-H - 14.8 * 0.94) * S}px,${(D / 2 - 9) * S}px) rotateX(-12deg)`)}"></div>
  </div>`;
}

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
body{width:1800px;height:1350px;overflow:hidden;
  background:
    radial-gradient(ellipse 40% 30% at 30% 0%, rgba(255,190,90,.18), transparent 70%),
    radial-gradient(ellipse 40% 30% at 80% 5%, rgba(140,90,255,.22), transparent 70%),
    linear-gradient(180deg,#120a1f 0%,#1c1230 58%,#2a2133 58.2%,#3a2f3c 100%)}
.lights{position:absolute;left:0;right:0;top:-70px;height:200px;opacity:.9}
.stage{position:absolute;inset:0;perspective:2400px;perspective-origin:50% 45%}
.booth{position:absolute;top:1215px;width:0;height:0;transform-style:preserve-3d}
.f{position:absolute;left:0;top:0;transform-origin:0 0;backface-visibility:hidden}
.booth .f[style*="rotateY(90deg)"],.booth .f[style*="rotateY(-90deg)"]{transform-origin:${20 * S}px 0}
.pole{background:linear-gradient(90deg,#8d8a96,#f2f1f6 45%,#9c99a6)}
.shadow{position:absolute;top:1185px;height:90px;border-radius:50%;background:radial-gradient(ellipse at center,rgba(0,0,0,.55),transparent 70%)}
.cap{position:absolute;left:60px;bottom:40px;font:600 22px/1.4 system-ui,sans-serif;color:rgba(255,255,255,.55)}
</style></head><body>
<svg class="lights" viewBox="0 0 1800 200" preserveAspectRatio="none">
  <path d="M0 40 Q450 150 900 60 T1800 50" fill="none" stroke="#3b3346" stroke-width="2"/>
  ${Array.from({ length: 34 }, (_, i) => { const t = i / 33; const x = t * 1800; const y = t < .5 ? 40 + 110 * Math.sin(Math.PI * t * 2) * 0.85 : 60 + 60 * Math.sin(Math.PI * (t - .5) * 2) * 0.7; return `<circle cx="${x}" cy="${y + 8}" r="7" fill="#ffd27a"/><circle cx="${x}" cy="${y + 8}" r="22" fill="#ffd27a" opacity=".18"/>`; }).join('')}
</svg>
<div class="shadow" style="left:330px;width:560px"></div>
<div class="shadow" style="left:930px;width:560px"></div>
<div class="stage">${booth(24, 600)}${booth(-20, 1200)}</div>
<div class="cap">Mock-up · promo counter 80 × 40 × 90 cm, header 80 × 25 cm, 2.0 m tall</div>
</body></html>`;

const file = path.join(OUT, '_mockup.html');
fs.writeFileSync(file, html);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1800, height: 1350 }, deviceScaleFactor: 1.5 });
await page.goto('file://' + file);
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, 'booth-mockup.png') });
await browser.close();
console.log('mockup ok');
