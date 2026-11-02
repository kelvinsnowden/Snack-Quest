import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Simplified Chinese editions of the documents we send manufacturers
 * (`docs/zh-CN/`) are translations of the English ones, which the contract
 * tests hold to the server. These checks keep the translation from drifting:
 * every code block is byte-identical and in the same order, every identifier
 * in backticks survives, and every table keeps its rows — so a changed
 * example, error code, header or limit in English fails until the Chinese
 * edition says the same.
 */

const DOCS = path.resolve(__dirname, '../../docs');
const PAIRS = ['MANUFACTURER_INTEGRATION_GUIDE.md', 'SNACK_QUEST_MACHINE_API_V1.md', 'MANUFACTURER_CERTIFICATION.md'];

function read(file: string): string {
  return readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function codeBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/^```[^\n]*\n([\s\S]*?)^```$/gm)].map((match) => match[0]);
}

function withoutCodeBlocks(markdown: string): string {
  return markdown.replace(/^```[^\n]*\n[\s\S]*?^```$/gm, '');
}

/** Inline code spans; a span may wrap onto the next line, as Markdown allows, and reads as one space there. */
function inlineCode(markdown: string): Set<string> {
  return new Set([...withoutCodeBlocks(markdown).matchAll(/`([^`]+)`/g)].map((match) => match[1].replace(/\s+/g, ' ')));
}

function tableRows(markdown: string): number {
  return withoutCodeBlocks(markdown)
    .split('\n')
    .filter((line) => line.startsWith('|')).length;
}

function headingLevels(markdown: string): string[] {
  return withoutCodeBlocks(markdown)
    .split('\n')
    .filter((line) => /^#{1,4} /.test(line))
    .map((line) => line.split(' ')[0]);
}

describe.each(PAIRS)('zh-CN edition of %s', (file) => {
  const english = read(path.join(DOCS, file));
  const chinese = read(path.join(DOCS, 'zh-CN', file));

  it('has every code block, byte for byte, in the same order', () => {
    expect(codeBlocks(chinese)).toEqual(codeBlocks(english));
  });

  it('keeps every identifier the English edition puts in backticks', () => {
    const missing = [...inlineCode(english)].filter((token) => !inlineCode(chinese).has(token));
    expect(missing).toEqual([]);
  });

  it('keeps the same tables, row for row, and the same heading structure', () => {
    expect(tableRows(chinese)).toBe(tableRows(english));
    expect(headingLevels(chinese)).toEqual(headingLevels(english));
  });
});
