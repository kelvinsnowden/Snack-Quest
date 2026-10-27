#!/usr/bin/env node
/**
 * Builds what we send vending machine manufacturers:
 *
 *   - the integration documentation as one PDF in English and one in
 *     Simplified Chinese (integration guide, API specification, certification);
 *   - the developer kit: both PDFs with the OpenAPI document, the signing test
 *     vectors and the reference code, as a folder and a zip.
 *
 *   node scripts/docs/buildManufacturerKit.mjs <outDir> [--fonts <dir>] [--edition 1.0] [--date 2026-10-27]
 *
 * The text comes from docs/ (English) and docs/zh-CN/ (Chinese); edit those and
 * rebuild. `tests/contract/translatedManufacturerDocs.test.ts` keeps the two
 * editions saying the same thing.
 *
 * --fonts: a folder holding Inter-400/600/700.ttf, NotoSansSC-400/700.ttf and
 * JetBrainsMono-400.ttf (all from Google Fonts) to embed. Without it the
 * system's fonts are used, which is fine for checking and plainer to read.
 *
 * Needs Playwright with Chromium (`npx playwright install chromium`).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { marked } from 'marked';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KIT = 'snack-quest-machine-api-v1-kit';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : fallback;
};
const outArg = args.find((arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--'));
if (!outArg) {
  console.error('usage: node scripts/docs/buildManufacturerKit.mjs <outDir> [--fonts <dir>] [--edition 1.0] [--date YYYY-MM-DD]');
  process.exit(1);
}
const outDir = path.resolve(outArg);
const fontsDir = option('--fonts', null);
const edition = option('--edition', '1.0');
const date = option('--date', new Date().toISOString().slice(0, 10));

/** The three documents, in the order a manufacturer reads them. */
const PARTS = [
  { key: 'guide', file: 'MANUFACTURER_INTEGRATION_GUIDE.md' },
  { key: 'spec', file: 'SNACK_QUEST_MACHINE_API_V1.md' },
  { key: 'cert', file: 'MANUFACTURER_CERTIFICATION.md' },
];

const LANGUAGES = {
  en: {
    dir: 'docs',
    pdf: 'Snack-Quest-Machine-API-v1-EN.pdf',
    lang: 'en',
    parts: { guide: ['Part I', 'Integration Guide'], spec: ['Part II', 'API Specification'], cert: ['Part III', 'Certification'] },
    cover: {
      eyebrow: 'Integration documentation',
      title: 'Machine API v1',
      subtitle: 'For vending machine manufacturers connecting their machines to Snack Quest',
      editionLabel: 'Edition',
      dateLabel: 'Date',
      apiLabel: 'API version',
      kitLabel: 'Developer kit',
      contactLabel: 'Questions',
      contact: 'Your Snack Quest integration engineer',
      inThis: 'In this document',
      partBlurb: {
        guide: 'What exists today, choosing a model, signing requests, and the work step by step.',
        spec: 'The contract: endpoints, the dispense lifecycle, guarantees, versioning and every error code.',
        cert: 'How a machine model is certified in the sandbox before it can sell.',
      },
      precedence: 'Where the guide and the specification differ, the specification applies.',
    },
    contents: 'Contents',
    header: 'Snack Quest · Machine API v1 · Integration documentation',
    page: 'Page',
    of: 'of',
    date: (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
  },
  zh: {
    dir: 'docs/zh-CN',
    pdf: 'Snack-Quest-Machine-API-v1-ZH-CN.pdf',
    lang: 'zh-CN',
    parts: { guide: ['第一部分', '对接指南'], spec: ['第二部分', 'API 规范'], cert: ['第三部分', '认证'] },
    cover: {
      eyebrow: '对接文档',
      title: '机器 API 第 1 版',
      subtitle: '面向将自动售货机接入 Snack Quest 的制造商',
      editionLabel: '文档版本',
      dateLabel: '日期',
      apiLabel: 'API 版本',
      kitLabel: '开发者套件',
      contactLabel: '联系方式',
      contact: '您的 Snack Quest 对接工程师',
      inThis: '本文档包含',
      partBlurb: {
        guide: '现有能力、对接模式的选择、请求签名，以及逐步的开发工作。',
        spec: '对接契约：接口、出货生命周期、保证、版本管理以及全部错误码。',
        cert: '机型在开始销售之前，如何在沙箱环境中通过认证。',
      },
      precedence: '对接指南与规范如有出入，以规范为准。',
    },
    contents: '目录',
    header: 'Snack Quest · 机器 API 第 1 版 · 对接文档',
    page: '第',
    of: '页，共',
    date: (iso) => {
      const [y, m, d] = iso.split('-').map(Number);
      return `${y} 年 ${m} 月 ${d} 日`;
    },
  },
};

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripTags = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** Every path the documents mention, as it is laid out in the kit (which mirrors the repository, so the reference code finds the test vectors). */
const KIT_PATHS = {
  'openapi/machine-api-v1.yaml': 'docs/openapi/machine-api-v1.yaml',
  'machine-api/signing-test-vectors.json': 'docs/machine-api/signing-test-vectors.json',
};

/**
 * One document, ready to sit inside the PDF: its own contents list dropped (the
 * PDF has one), links to the other documents pointed at their part, and links
 * to files turned into the file's name in the kit.
 */
function prepare(markdown, language) {
  const t = LANGUAGES[language];
  let text = markdown.replace(/\r\n/g, '\n');
  // The specification's own contents list.
  text = text.replace(/^## (Contents|目录)\n[\s\S]*?\n---\n/m, '');
  // Links to another document of the three: to its part, or to a numbered section of it.
  text = text.replace(/\[([^\]]+)\]\((?:\.\.\/)*(?:docs\/)?(MANUFACTURER_INTEGRATION_GUIDE|SNACK_QUEST_MACHINE_API_V1|MANUFACTURER_CERTIFICATION)\.md(?:#(\d+)[^)]*)?\)/g, (_, label, file, section) => {
    const part = PARTS.find((candidate) => candidate.file === `${file}.md`).key;
    const isFileName = /^`[^`]*\.md`$/.test(label);
    const shown = isFileName ? `${t.parts[part][0]} · ${t.parts[part][1]}` : label;
    return `[${shown}](#${part}${section ? `-${section}` : ''})`;
  });
  // Links to files: the file's path in the kit, as text.
  text = text.replace(/\[`([^`]+)`\]\((?:\.\.\/)*(?:docs\/)?(?:openapi|machine-api|sdk)\/[^)]*\)/g, (_, label) => `\`${KIT_PATHS[label] ?? label}\``);
  text = text.replace(/`(openapi\/machine-api-v1\.yaml|machine-api\/signing-test-vectors\.json)`/g, (_, label) => `\`${KIT_PATHS[label]}\``);
  return text;
}

/** HTML for one part, with stable ids on its headings: `spec-5-3` for "5.3 Heartbeat", `spec-h7` for an unnumbered one. */
function renderPart(part, markdown, language) {
  const t = LANGUAGES[language];
  let unnumbered = 0;
  const headings = [];
  const html = marked.parse(markdown, { gfm: true }).replace(/<h([1-4])>([\s\S]*?)<\/h\1>/g, (_, level, inner) => {
    const text = stripTags(inner).trim();
    if (level === '1') {
      headings.push({ level: 1, id: part, text: t.parts[part][1] });
      return `<header class="part-title" id="${part}"><p class="part-label">${escapeHtml(t.parts[part][0])}</p><h1>${inner}</h1></header>`;
    }
    const number = text.match(/^(\d+(?:\.\d+)*)\.?\s/);
    const id = number ? `${part}-${number[1].replace(/\./g, '-')}` : `${part}-h${(unnumbered += 1)}`;
    headings.push({ level: Number(level), id, text });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  return { html: `<section class="part" lang="${t.lang}">${html}</section>`, headings };
}

function fontFaces() {
  if (!fontsDir) return '';
  const face = (family, file, weight) => {
    const source = path.join(path.resolve(fontsDir), file);
    if (!existsSync(source)) throw new Error(`--fonts: ${file} is missing from ${fontsDir}`);
    return `@font-face { font-family: '${family}'; font-weight: ${weight}; src: url('${pathToFileURL(source).href}') format('truetype'); }`;
  };
  return [
    face('Inter', 'Inter-400.ttf', 400),
    face('Inter', 'Inter-600.ttf', 600),
    face('Inter', 'Inter-700.ttf', 700),
    face('Noto Sans SC', 'NotoSansSC-400.ttf', 400),
    face('Noto Sans SC', 'NotoSansSC-700.ttf', 700),
    face('JetBrains Mono', 'JetBrainsMono-400.ttf', 400),
  ].join('\n');
}

const STYLE = `
:root {
  --ink: #1f1f1f;
  --muted: #5d5a55;
  --faint: #8a857d;
  --rule: #e4ded4;
  --accent: #ff7a00;
  --accent-ink: #b45400;
  --panel: #faf7f2;
  --code-bg: #f4f1ec;
}
@page { size: A4; margin: 20mm 18mm 18mm 18mm; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  margin: 0;
  color: var(--ink);
  background: #ffffff;
  font-family: 'Inter', 'Noto Sans SC', 'WenQuanYi Zen Hei', system-ui, sans-serif;
  font-size: 9.6pt;
  line-height: 1.55;
}
/* Chinese reads better with more leading; set on the body so code keeps its own. */
body.zh { line-height: 1.7; }
/* No ligatures: "!=" must stay "!=" in code people copy. */
code, pre { font-family: 'JetBrains Mono', 'DejaVu Sans Mono', monospace; font-variant-ligatures: none; font-feature-settings: 'liga' 0, 'calt' 0; }

/* Cover */
.cover { height: 257mm; display: flex; flex-direction: column; justify-content: space-between; break-after: page; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 13pt; letter-spacing: 0.01em; }
.brand-mark { width: 26px; height: 26px; border-radius: 8px; background: var(--accent); display: inline-block; }
.cover-main { border-left: 4px solid var(--accent); padding-left: 22px; }
.eyebrow { color: var(--accent-ink); font-weight: 600; font-size: 10.5pt; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 10px; }
.cover h1 { font-size: 40pt; line-height: 1.05; margin: 0 0 14px; font-weight: 700; letter-spacing: -0.01em; }
.cover .subtitle { font-size: 14pt; color: var(--muted); margin: 0; max-width: 140mm; line-height: 1.4; }
.facts { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
.facts th { text-align: left; font-weight: 600; color: var(--muted); width: 34mm; padding: 6px 0; border-top: 1px solid var(--rule); vertical-align: top; }
.facts td { padding: 6px 0; border-top: 1px solid var(--rule); }
.in-this { margin-top: 18px; }
.in-this h2 { font-size: 10.5pt; margin: 0 0 8px; border: 0; padding: 0; }
.in-this ol { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.in-this li { display: grid; grid-template-columns: 24mm 1fr; gap: 10px; }
.in-this .label { color: var(--accent-ink); font-weight: 600; }
.in-this .name { font-weight: 600; }
.in-this .blurb { color: var(--muted); display: block; font-weight: 400; }
.precedence { color: var(--faint); font-size: 8.8pt; margin: 14px 0 0; }

/* Contents */
.toc { break-after: page; }
.toc h1 { font-size: 22pt; margin: 0 0 16px; }
.toc ol { list-style: none; padding: 0; margin: 0; }
.toc > ol > li { margin: 0 0 14px; break-inside: avoid; }
.toc .toc-part { display: block; font-weight: 700; font-size: 11pt; padding-bottom: 4px; border-bottom: 1px solid var(--rule); margin-bottom: 4px; }
.toc .toc-part span { color: var(--accent-ink); margin-right: 8px; }
.toc li li { padding: 2px 0 2px 12px; font-size: 9.4pt; }
.toc a { color: var(--ink); text-decoration: none; }

/* Parts */
.part { break-before: page; }
.part-title { border-left: 4px solid var(--accent); padding: 4px 0 4px 18px; margin: 0 0 22px; }
.part-label { color: var(--accent-ink); font-weight: 600; font-size: 10pt; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 4px; }
.part-title h1 { font-size: 24pt; line-height: 1.15; margin: 0; }
.part-title + p { font-size: 11pt; color: var(--muted); }
h2 { font-size: 15pt; margin: 26px 0 10px; padding-top: 10px; border-top: 1px solid var(--rule); break-after: avoid; }
h3 { font-size: 11.5pt; margin: 20px 0 8px; break-after: avoid; }
h4 { font-size: 10pt; margin: 16px 0 6px; break-after: avoid; }
p { margin: 0 0 9px; orphans: 3; widows: 3; }
ul, ol { margin: 0 0 10px; padding-left: 20px; }
li { margin: 2px 0; }
li > ul, li > ol { margin: 4px 0; }
a { color: var(--accent-ink); text-decoration: none; }
strong { font-weight: 600; }
hr { border: 0; height: 0; margin: 18px 0 0; }

:not(pre) > code {
  background: var(--code-bg);
  border-radius: 4px;
  padding: 0.5px 4px;
  font-size: 8.4pt;
  /* An identifier is never split to make a column narrower; only one too long for a whole line breaks. */
  overflow-wrap: break-word;
}
pre {
  background: var(--code-bg);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--accent);
  border-radius: 6px;
  padding: 9px 11px;
  margin: 0 0 12px;
  font-size: 7.1pt;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
pre code { background: none; padding: 0; font-size: inherit; }

table { width: 100%; border-collapse: collapse; margin: 0 0 14px; font-size: 8.6pt; line-height: 1.45; }
thead { display: table-header-group; }
th { text-align: left; font-weight: 600; background: var(--panel); border-bottom: 1px solid var(--ink); }
th, td { padding: 5px 7px; vertical-align: top; border-bottom: 1px solid var(--rule); }
tr { break-inside: avoid; }
td code, th code { font-size: 7.8pt; }

input[type="checkbox"] { width: 9px; height: 9px; margin: 0 6px 0 -16px; vertical-align: -1px; }
li:has(> input[type="checkbox"]) { list-style: none; }
`;

function buildHtml(language) {
  const t = LANGUAGES[language];
  const parts = PARTS.map(({ key, file }) => renderPart(key, prepare(readFileSync(path.join(ROOT, t.dir, file), 'utf8'), language), language));
  const contents = PARTS.map(({ key }, index) => {
    const sections = parts[index].headings.filter((heading) => heading.level === 2);
    return `<li><a class="toc-part" href="#${key}"><span>${escapeHtml(t.parts[key][0])}</span>${escapeHtml(t.parts[key][1])}</a><ol>${sections.map((heading) => `<li><a href="#${heading.id}">${escapeHtml(heading.text)}</a></li>`).join('')}</ol></li>`;
  }).join('');
  const c = t.cover;
  const cover = `
<section class="cover">
  <div class="brand"><span class="brand-mark" aria-hidden="true"></span>Snack Quest</div>
  <div class="cover-main">
    <p class="eyebrow">${escapeHtml(c.eyebrow)}</p>
    <h1>${escapeHtml(c.title)}</h1>
    <p class="subtitle">${escapeHtml(c.subtitle)}</p>
  </div>
  <div>
    <table class="facts">
      <tr><th>${escapeHtml(c.apiLabel)}</th><td>v1 · <code>/api/v1/</code></td></tr>
      <tr><th>${escapeHtml(c.editionLabel)}</th><td>${escapeHtml(edition)}</td></tr>
      <tr><th>${escapeHtml(c.dateLabel)}</th><td>${escapeHtml(t.date(date))}</td></tr>
      <tr><th>${escapeHtml(c.kitLabel)}</th><td><code>${KIT}.zip</code></td></tr>
      <tr><th>${escapeHtml(c.contactLabel)}</th><td>${escapeHtml(c.contact)}</td></tr>
    </table>
    <div class="in-this">
      <h2>${escapeHtml(c.inThis)}</h2>
      <ol>${PARTS.map(({ key }) => `<li><span class="label">${escapeHtml(t.parts[key][0])}</span><span><span class="name">${escapeHtml(t.parts[key][1])}</span><span class="blurb">${escapeHtml(c.partBlurb[key])}</span></span></li>`).join('')}</ol>
      <p class="precedence">${escapeHtml(c.precedence)}</p>
    </div>
  </div>
</section>`;
  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(`Snack Quest — ${c.title}`)}</title>
<style>${fontFaces()}\n${STYLE}</style>
</head>
<body class="${language}">
${cover}
<nav class="toc"><h1>${escapeHtml(t.contents)}</h1><ol>${contents}</ol></nav>
${parts.map((part) => part.html).join('\n')}
</body>
</html>`;
}

async function printPdf(browser, html, file, language) {
  const t = LANGUAGES[language];
  const page = await browser.newPage();
  const htmlFile = file.replace(/\.pdf$/, '.html');
  writeFileSync(htmlFile, html);
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const small = 'font-family: Inter, "Noto Sans SC", "WenQuanYi Zen Hei", sans-serif; font-size: 7.5pt; color: #8a857d; width: 100%; padding: 0 18mm;';
  await page.pdf({
    path: file,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: `<div style='${small} display: flex; justify-content: space-between;'><span>${escapeHtml(t.header)}</span><span>${escapeHtml(`${edition} · ${date}`)}</span></div>`,
    footerTemplate:
      language === 'zh'
        ? `<div style='${small} text-align: right;'>${t.page} <span class="pageNumber"></span> ${t.of} <span class="totalPages"></span> 页</div>`
        : `<div style='${small} text-align: right;'>${t.page} <span class="pageNumber"></span> ${t.of} <span class="totalPages"></span></div>`,
  });
  await page.close();
}

const KIT_FILES = [
  'docs/openapi/machine-api-v1.yaml',
  'docs/machine-api/signing-test-vectors.json',
  'sdk/typescript/snackQuestMachine.ts',
  'sdk/python/snack_quest_machine.py',
  'sdk/python/example_machine.py',
  'sdk/python/test_signing_vectors.py',
  'sdk/c/sq_sign.c',
  'sdk/c/sq_sign.h',
  'sdk/c/vector_check.c',
];

const README = (pdfs) => `Snack Quest Machine API v1 — developer kit
Edition ${edition}, ${date}

Start with the documentation:
  ${pdfs.en}     English
  ${pdfs.zh}  简体中文

What else is here
  docs/openapi/machine-api-v1.yaml          The API, machine-readable (OpenAPI 3.0). Import it into Postman or a code generator.
  docs/machine-api/signing-test-vectors.json Official request-signing test vectors. Reproduce every one before calling the API.
  sdk/typescript/snackQuestMachine.ts       Reference client for Node.js 18+, no dependencies.
  sdk/python/snack_quest_machine.py         Reference client for Python 3.8+, standard library only.
  sdk/python/example_machine.py             A complete minimal machine built on it.
  sdk/python/test_signing_vectors.py        Checks the Python signing against the vectors:
                                              python3 -m unittest sdk/python/test_signing_vectors.py
  sdk/c/sq_sign.c, sq_sign.h, vector_check.c  Request signing in C99 for embedded controllers.

Your sandbox base URL, keys and machine registrations come from your Snack Quest
integration engineer. The specification is the contract; if anything here and the
specification differ, the specification applies.

------------------------------------------------------------------------------

Snack Quest 机器 API 第 1 版 — 开发者套件
文档版本 ${edition}，${date}

请先阅读文档：
  ${pdfs.zh}  简体中文
  ${pdfs.en}     English

套件中的其他内容
  docs/openapi/machine-api-v1.yaml          机器可读的 API 定义（OpenAPI 3.0），可导入 Postman 或代码生成工具。
  docs/machine-api/signing-test-vectors.json 官方请求签名测试向量。调用 API 之前，请先复现每一个测试向量。
  sdk/typescript/snackQuestMachine.ts       Node.js 18+ 参考客户端，无外部依赖。
  sdk/python/snack_quest_machine.py         Python 3.8+ 参考客户端，仅使用标准库。
  sdk/python/example_machine.py             基于该客户端的完整最小化机器示例。
  sdk/python/test_signing_vectors.py        用测试向量检验 Python 签名：
                                              python3 -m unittest sdk/python/test_signing_vectors.py
  sdk/c/sq_sign.c、sq_sign.h、vector_check.c  面向嵌入式控制器的 C99 请求签名实现。

沙箱基础 URL、密钥和机器登记信息由您的 Snack Quest 对接工程师提供。规范即为对接契约；
本套件中的任何内容与规范如有出入，以规范为准。
`;

async function main() {
  const require = createRequire(import.meta.url);
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    throw new Error('Playwright is needed to print the PDFs: npm i -D playwright && npx playwright install chromium');
  }
  const kitDir = path.join(outDir, KIT);
  rmSync(kitDir, { recursive: true, force: true });
  mkdirSync(kitDir, { recursive: true });

  const browser = await chromium.launch();
  const pdfs = {};
  for (const language of Object.keys(LANGUAGES)) {
    const file = path.join(outDir, LANGUAGES[language].pdf);
    await printPdf(browser, buildHtml(language), file, language);
    copyFileSync(file, path.join(kitDir, LANGUAGES[language].pdf));
    pdfs[language] = LANGUAGES[language].pdf;
    console.log(`wrote ${file}`);
  }
  await browser.close();

  for (const file of KIT_FILES) {
    mkdirSync(path.dirname(path.join(kitDir, file)), { recursive: true });
    copyFileSync(path.join(ROOT, file), path.join(kitDir, file));
  }
  writeFileSync(path.join(kitDir, 'README.txt'), README(pdfs));
  const zip = path.join(outDir, `${KIT}.zip`);
  rmSync(zip, { force: true });
  execFileSync('zip', ['-qr', `${KIT}.zip`, KIT], { cwd: outDir });
  console.log(`wrote ${zip}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
