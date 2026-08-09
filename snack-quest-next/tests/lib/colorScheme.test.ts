import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Guards the two things that keep Snack Quest on-brand for a visitor
 * whose phone is in dark mode (§ Chrome repaints the site).
 *
 * Both failures are invisible in code review and in every desktop
 * check — the page only goes wrong on someone else's phone, and the
 * computed styles still read as light while it does. That is exactly
 * the kind of regression worth pinning in a test rather than trusting
 * to a comment.
 */

const globalsCss = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');

/**
 * Comments in this file discuss `@media (prefers-color-scheme: dark)`
 * at length — explaining why it isn't there. Matching prose would make
 * the rule below fail on its own documentation, so assertions about
 * what the stylesheet *does* run against the stylesheet minus what it
 * *says*.
 */
const activeCss = globalsCss.replace(/\/\*[\s\S]*?\*\//g, '');

describe('globals.css colour scheme', () => {
  it('opts out of browser-synthesised dark mode with `only light`', () => {
    // Bare `light` merely declares that a light theme exists; Chrome's
    // Auto Dark Theme on Android will still invert the page. The `only`
    // keyword is the opt-out. Verified against Chromium's
    // WebContentsForceDark: without it, every page came back inverted.
    expect(activeCss).toContain('color-scheme: only light');
    expect(activeCss).not.toMatch(/color-scheme:\s*light\s*;/);
  });

  it('never repaints the palette from an OS preference', () => {
    // The original bug: a `prefers-color-scheme: dark` block swapped
    // every semantic token, including the brand orange, for anyone
    // whose OS was dark — while nothing ever stamped the
    // `data-theme="dark"` escape hatch that was supposed to control it.
    const mediaBlocks = activeCss.match(/@media\s*\([^)]*prefers-color-scheme[^)]*\)/g) ?? [];
    expect(mediaBlocks).toEqual([]);
  });

  it('keeps the dark palette available for a deliberate, stamped theme', () => {
    // Removing OS-driven theming is not the same as deleting dark mode.
    // A future toggle that stamps `data-theme="dark"` still gets a full
    // palette, which is why the tokens stay.
    expect(activeCss).toMatch(/:root\[data-theme=['"]dark['"]\]/);
  });
});
