import { describe, expect, it } from 'vitest';
import { brandedEmailHtml, escapeHtml, paragraphsToHtml } from '@/lib/notifications/brandedEmailHtml';

describe('escapeHtml', () => {
  it('escapes every HTML-significant character', () => {
    expect(escapeHtml(`<script>alert('x')</script> & "quoted"`)).toBe(
      '&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; &quot;quoted&quot;',
    );
  });
});

describe('paragraphsToHtml', () => {
  it('splits on blank lines into escaped <p> tags', () => {
    const html = paragraphsToHtml('First paragraph.\n\nSecond paragraph with <b>tags</b>.');
    expect(html).toBe('<p>First paragraph.</p><p>Second paragraph with &lt;b&gt;tags&lt;/b&gt;.</p>');
  });

  it('preserves single line breaks within a paragraph as <br />', () => {
    const html = paragraphsToHtml('Line one\nLine two');
    expect(html).toBe('<p>Line one<br />Line two</p>');
  });

  it('drops empty paragraphs from extra blank lines', () => {
    const html = paragraphsToHtml('First.\n\n\n\nSecond.');
    expect(html).toBe('<p>First.</p><p>Second.</p>');
  });
});

describe('brandedEmailHtml', () => {
  it('renders the heading and body, escaping the heading', () => {
    const html = brandedEmailHtml({ heading: 'Hi <you>', bodyHtml: '<p>Body</p>' });
    expect(html).toContain('Hi &lt;you&gt;');
    expect(html).toContain('<p>Body</p>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<a href');
  });

  it('includes a hero image when given, escaping the URL', () => {
    const html = brandedEmailHtml({ heading: 'H', bodyHtml: 'B', imageUrl: 'https://example.com/a.png?x=1&y=2' });
    expect(html).toContain('<img src="https://example.com/a.png?x=1&amp;y=2"');
  });

  it('includes a CTA button only when both label and URL are given', () => {
    const withCta = brandedEmailHtml({ heading: 'H', bodyHtml: 'B', ctaLabel: 'Shop', ctaUrl: 'https://example.com' });
    expect(withCta).toContain('<a href="https://example.com"');
    expect(withCta).toContain('>Shop<');

    const labelOnly = brandedEmailHtml({ heading: 'H', bodyHtml: 'B', ctaLabel: 'Shop', ctaUrl: null });
    expect(labelOnly).not.toContain('<a href');

    const urlOnly = brandedEmailHtml({ heading: 'H', bodyHtml: 'B', ctaUrl: 'https://example.com' });
    expect(urlOnly).not.toContain('<a href');
  });

  it('carries no external images, web fonts, or tracking pixels beyond an explicit hero image', () => {
    const html = brandedEmailHtml({ heading: 'H', bodyHtml: 'B' });
    expect(html).not.toMatch(/fonts\.googleapis|<link/);
    expect(html).not.toContain('<img');
  });
});
