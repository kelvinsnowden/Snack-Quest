// Snack Quest promo booth — print artwork generator.
// Renders each panel at real size (cm) to PDF (vector text, print-ready)
// and PNG previews, then a booth mockup from those PNGs.
import { chromium } from 'playwright-core';
import QRCode from 'qrcode';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });

const URL_ORDER = 'https://snackquests.shop/boxes?utm_source=booth&utm_medium=event';
const qrSvg = await QRCode.toString(URL_ORDER, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#16062f', light: '#ffffff' } });
const qrData = 'data:image/svg+xml;base64,' + Buffer.from(qrSvg).toString('base64');

const font = (p) => 'file://' + path.join(ROOT, 'node_modules/@fontsource', p);
const asset = (p) => 'file://' + path.join(ROOT, 'assets', p);

const BASE_CSS = `
@font-face{font-family:Bagel;src:url(${font('bagel-fat-one/files/bagel-fat-one-latin-400-normal.woff2')}) format('woff2');}
@font-face{font-family:Geist;font-weight:400;src:url(${font('geist-sans/files/geist-sans-latin-400-normal.woff2')}) format('woff2');}
@font-face{font-family:Geist;font-weight:600;src:url(${font('geist-sans/files/geist-sans-latin-600-normal.woff2')}) format('woff2');}
@font-face{font-family:Geist;font-weight:800;src:url(${font('geist-sans/files/geist-sans-latin-800-normal.woff2')}) format('woff2');}
@font-face{font-family:Geist;font-weight:900;src:url(${font('geist-sans/files/geist-sans-latin-900-normal.woff2')}) format('woff2');}
:root{--deep:#16062f;--ink:#1d0841;--plum:#2c0d63;--purple:#6c3bff;--orange:#ff7a00;--lime:#b8e81f;--cream:#fff6e6;}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--deep);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.canvas{position:relative;overflow:hidden;font-family:Geist,sans-serif;color:#fff;
  background:
    radial-gradient(ellipse 70% 55% at 50% 52%, rgba(108,59,255,.55), transparent 70%),
    radial-gradient(ellipse 60% 40% at 85% 0%, rgba(255,122,0,.22), transparent 70%),
    linear-gradient(180deg,var(--plum),var(--ink) 55%,var(--deep));}
.abs{position:absolute}
.display{font-family:Bagel,sans-serif;font-weight:400;line-height:.9;text-transform:uppercase;letter-spacing:.01em}
.o{color:var(--orange)} .l{color:var(--lime)} .w{color:#fff}
.stroke{-webkit-text-stroke:0;paint-order:stroke fill;text-shadow:0 .12em 0 rgba(0,0,0,.35)}
.pattern{position:absolute;inset:0;pointer-events:none}
.guides .trim{position:absolute;border:1px dashed #00e5ff;z-index:99}
.guides .safe{position:absolute;border:1px dashed #ff2bd6;z-index:99}
`;

/** Decorative layer: orbit arcs, dotted flight path and sparkles, in canvas units (cm). */
function pattern(w, h, seed = 1) {
  let s = seed * 9301;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const stars = [];
  for (let i = 0; i < Math.max(6, Math.round((w * h) / 140)); i++) {
    const k = Math.min(w, h) / 80; const x = rnd() * w, y = rnd() * h, r = (0.25 + rnd() * 0.6) * Math.max(k, 0.25);
    const c = rnd() < 0.5 ? '#b8e81f' : rnd() < 0.5 ? '#ff7a00' : '#ffffff';
    const o = 0.35 + rnd() * 0.5;
    if (rnd() < 0.55) {
      stars.push(`<path d="M${x} ${y - r * 2}Q${x} ${y} ${x + r * 2} ${y}Q${x} ${y} ${x} ${y + r * 2}Q${x} ${y} ${x - r * 2} ${y}Q${x} ${y} ${x} ${y - r * 2}Z" fill="${c}" opacity="${o}"/>`);
    } else {
      stars.push(`<circle cx="${x}" cy="${y}" r="${r * 0.45}" fill="${c}" opacity="${o * 0.8}"/>`);
    }
  }
  return `<svg class="pattern" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="#ffffff" stroke-opacity=".07" stroke-width=".18">
      <ellipse cx="${w / 2}" cy="${h * 0.58}" rx="${w * 0.62}" ry="${h * 0.3}"/>
      <ellipse cx="${w / 2}" cy="${h * 0.58}" rx="${w * 0.45}" ry="${h * 0.42}"/>
      <ellipse cx="${w / 2}" cy="${h * 0.58}" rx="${w * 0.25}" ry="${h * 0.42}"/>
      <line x1="${w / 2}" y1="${h * 0.16}" x2="${w / 2}" y2="${h}"/>
    </g>
    ${stars.join('')}
  </svg>`;
}

function guides(w, h, bleed, safe) {
  return `<div class="guides"><div class="trim" style="left:${bleed}cm;top:${bleed}cm;width:${w - 2 * bleed}cm;height:${h - 2 * bleed}cm"></div>
  <div class="safe" style="left:${bleed + safe}cm;top:${bleed + safe}cm;width:${w - 2 * (bleed + safe)}cm;height:${h - 2 * (bleed + safe)}cm"></div></div>`;
}

const COUNTRIES = ['Japan', 'Korea', 'China', 'Thailand'];

// ---------- HEADER 80 x 25 cm (+1 cm bleed) ----------
function header() {
  const W = 82, H = 27;
  return { name: 'header', w: W, h: H, bleed: 1, safe: 1.5, html: `
  <div class="canvas" style="width:${W}cm;height:${H}cm;background:linear-gradient(100deg,var(--deep),var(--plum) 45%,#3a128a)">
    ${pattern(W, H, 3)}
    <div class="abs" style="left:-3cm;top:-6cm;width:34cm;height:39cm;border-radius:50%;background:radial-gradient(circle,rgba(255,122,0,.35),transparent 65%)"></div>
    <img class="abs" src="${asset('logo-cut@4x.png')}" style="left:2.2cm;top:1.6cm;height:23.8cm">
    <div class="abs" style="left:28cm;top:3.5cm;right:3cm">
      <div style="font-weight:800;font-size:1.25cm;letter-spacing:.14em;color:var(--lime);text-transform:uppercase">Snacks from ${COUNTRIES.join(' · ')}</div>
      <div class="display stroke" style="font-size:5.3cm;margin-top:.9cm">Explore the <span class="o">flavours</span></div>
      <div class="display stroke" style="font-size:5.3cm;margin-top:.35cm">of the <span class="l">world.</span></div>
    </div>
    <div class="abs" style="right:2.6cm;bottom:2.3cm;font-weight:800;font-size:1.25cm;letter-spacing:.04em;color:var(--cream)">snackquests.shop</div>
  </div>` };
}

// ---------- FRONT COUNTER 80 x 90 cm (+1 cm bleed) ----------
function front() {
  const W = 82, H = 92;
  const stamp = (label, x, y, rot, color) => `
    <div class="abs display" style="left:${x}cm;top:${y}cm;width:12.5cm;height:12.5cm;border-radius:50%;
      background:${color};color:var(--deep);display:flex;align-items:center;justify-content:center;text-align:center;
      font-size:${label.length > 6 ? 2.0 : 2.5}cm;transform:rotate(${rot}deg);box-shadow:0 .5cm 1.2cm rgba(0,0,0,.45);
      outline:.35cm dashed rgba(22,6,47,.35);outline-offset:-1.05cm">${label}</div>`;
  return { name: 'front-counter', w: W, h: H, bleed: 1, safe: 3, html: `
  <div class="canvas" style="width:${W}cm;height:${H}cm">
    ${pattern(W, H, 7)}
    <svg class="pattern" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 66 C 18 40, 30 72, 41 56 S 66 38, 77 62" fill="none" stroke="#b8e81f" stroke-opacity=".55" stroke-width=".35" stroke-dasharray="1 1.1" stroke-linecap="round"/>
    </svg>
    <img class="abs" src="${asset('logo-cut@4x.png')}" style="left:${W / 2 - 11}cm;top:2.4cm;width:22cm">
    <div class="abs" style="left:0;right:0;top:24.6cm;text-align:center">
      <div class="display stroke" style="font-size:5.6cm">Explore the</div>
      <div class="display stroke o" style="font-size:6.6cm;margin-top:.25cm">flavours</div>
      <div class="display stroke" style="font-size:5.6cm;margin-top:.25cm">of the <span class="l">world.</span></div>
    </div>
    <div class="abs" style="left:${W / 2 - 17}cm;top:45cm;width:34cm;height:34cm;border-radius:50%;background:radial-gradient(circle,rgba(255,180,90,.55),rgba(255,122,0,.18) 45%,transparent 70%)"></div>
    <img class="abs" src="${asset('hero@2x.png')}" style="left:${W / 2 - 15.6}cm;top:44.2cm;height:33.4cm">
    ${stamp('Japan', 4.8, 45.5, -9, 'var(--lime)')}
    ${stamp('Korea', 6.8, 60.5, 7, 'var(--orange)')}
    ${stamp('China', W - 17.3, 45.5, 8, 'var(--orange)')}
    ${stamp('Thailand', W - 19.3, 60.5, -7, 'var(--lime)')}
    <div class="abs" style="left:0;right:0;bottom:0;height:13.2cm;background:linear-gradient(90deg,var(--orange),#ff9a1f);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.5cm;padding-bottom:1cm">
      <div class="display" style="font-size:3.3cm;color:var(--deep)">Pick. Taste. Discover.</div>
      <div style="font-weight:800;font-size:1.65cm;letter-spacing:.06em;color:var(--deep)">ORDER AT SNACKQUESTS.SHOP · DELIVERED ACROSS KENYA</div>
    </div>
  </div>` };
}

// ---------- SIDE PANELS 40 x 90 cm (+1 cm bleed) ----------
function side() {
  const W = 42, H = 92;
  const box = (name, price, line, tag) => `
    <div style="position:relative;background:rgba(255,255,255,.08);border:.18cm solid ${tag ? 'var(--orange)' : 'rgba(255,255,255,.25)'};border-radius:1.4cm;padding:1.5cm 1.7cm">
      ${tag ? `<div class="abs" style="right:1.2cm;top:-1.1cm;background:var(--orange);color:var(--deep);font-weight:900;font-size:1cm;letter-spacing:.08em;padding:.45cm .8cm;border-radius:1cm">${tag}</div>` : ''}
      <div class="display" style="font-size:2.6cm">${name}</div>
      <div class="display ${tag ? 'o' : 'l'}" style="font-size:4.1cm;margin-top:.5cm">KES ${price}</div>
      <div style="font-weight:600;font-size:1.15cm;line-height:1.3;margin-top:.7cm;color:var(--cream)">${line}</div>
    </div>`;
  return { name: 'side-panel', w: W, h: H, bleed: 1, safe: 2.5, html: `
  <div class="canvas" style="width:${W}cm;height:${H}cm">
    ${pattern(W, H, 11)}
    <div class="abs" style="left:${W / 2 - 9}cm;top:3.4cm;width:18cm;text-align:center">
      <div class="display l" style="font-size:2.6cm">Scan to order</div>
      <div style="background:#fff;border-radius:1.2cm;padding:1.3cm;margin-top:1cm"><img src="${qrData}" style="width:100%;display:block"></div>
      <div style="font-weight:800;font-size:1.25cm;margin-top:.8cm;letter-spacing:.03em">snackquests.shop</div>
    </div>
    <div class="abs" style="left:3.5cm;right:3.5cm;top:33.5cm;display:flex;flex-direction:column;gap:2.1cm">
      <div class="display stroke" style="font-size:3.4cm;text-align:center">Pick your <span class="o">box</span></div>
      ${box('Deluxe box', '3,500', 'A bigger, more varied snack selection.', '')}
      ${box('Premium box', '5,000', 'You pick 5 snacks. We surprise you with the rest.', 'BEST VALUE')}
    </div>
    <img class="abs" src="${asset('logo-cut@4x.png')}" style="left:${W / 2 - 7}cm;top:72cm;width:14cm">
    <div class="abs" style="left:0;right:0;top:86.2cm;text-align:center;font-weight:600;font-size:1.05cm;color:var(--cream)">Delivered across Kenya</div>
  </div>` };
}

// ---------- TABLETOP QR CARD, A5 landscape 21 x 14.8 cm (+3 mm bleed) ----------
function tent() {
  const W = 21.6, H = 15.4;
  return { name: 'table-qr-card-a5', w: W, h: H, bleed: 0.3, safe: 0.6, html: `
  <div class="canvas" style="width:${W}cm;height:${H}cm">
    ${pattern(W, H, 5)}
    <div class="abs" style="left:1.3cm;top:1.6cm;width:8.4cm;background:#fff;border-radius:.6cm;padding:.6cm"><img src="${qrData}" style="width:100%;display:block"></div>
    <div class="abs" style="left:1.3cm;top:11.1cm;width:8.4cm;text-align:center;font-weight:800;font-size:.55cm;letter-spacing:.04em">snackquests.shop</div>
    <div class="abs" style="left:10.8cm;top:1.5cm;right:1.1cm">
      <img src="${asset('logo-cut@4x.png')}" style="width:4.6cm;display:block;margin:-.4cm 0 0 -.3cm">
      <div class="display l" style="font-size:1.55cm;margin-top:.1cm">Scan to order</div>
      <div style="margin-top:.55cm;font-weight:800;font-size:.62cm;line-height:1.55">
        Deluxe box <span class="o">KES 3,500</span><br>Premium box <span class="o">KES 5,000</span>
      </div>
      <div style="margin-top:.35cm;font-weight:600;font-size:.46cm;color:var(--cream);opacity:.85">Snacks from Japan, Korea, China &amp; Thailand · Delivered across Kenya</div>
    </div>
  </div>` };
}

const panels = [header(), front(), side(), tent()];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
const PX_PER_CM = 96 / 2.54;

for (const p of panels) {
  for (const mode of ['print', 'proof']) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}@page{size:${p.w}cm ${p.h}cm;margin:0}</style></head>
      <body>${p.html.replace('<div class="canvas"', `<div class="canvas" id="c"`)}${mode === 'proof' ? '' : ''}</body></html>`;
    const withGuides = mode === 'proof' ? html.replace('</body>', `<div style="position:absolute;left:0;top:0">${guides(p.w, p.h, p.bleed, p.safe)}</div></body>`) : html;
    const file = path.join(OUT, `_${p.name}-${mode}.html`);
    fs.writeFileSync(file, withGuides);
    await page.setViewportSize({ width: Math.ceil(p.w * PX_PER_CM), height: Math.ceil(p.h * PX_PER_CM) });
    await page.goto('file://' + file);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    if (mode === 'print') {
      await page.pdf({ path: path.join(OUT, `${p.name}.pdf`), width: `${p.w}cm`, height: `${p.h}cm`, printBackground: true, pageRanges: '1' });
      // Raster for the mockup and for printers who want an image: 100 px/cm (~254 dpi) for small items, 60 px/cm (~150 dpi) for big panels.
      const pxPerCm = p.w < 30 ? 100 : 60;
      const scale = pxPerCm / PX_PER_CM;
      const p2 = await browser.newPage({ deviceScaleFactor: scale, viewport: { width: Math.ceil(p.w * PX_PER_CM), height: Math.ceil(p.h * PX_PER_CM) } });
      await p2.goto('file://' + file);
      await p2.evaluate(() => document.fonts.ready);
      await p2.waitForTimeout(150);
      await p2.locator('#c').screenshot({ path: path.join(OUT, `${p.name}.png`) });
      await p2.close();
    } else {
      await page.screenshot({ path: path.join(OUT, `${p.name}-proof.png`), fullPage: false });
    }
  }
}
await browser.close();
console.log('done', panels.map((p) => p.name).join(', '));
