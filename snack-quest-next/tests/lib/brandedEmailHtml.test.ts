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
    expect(html).toContain('First paragraph.</p>');
    expect(html).toContain('Second paragraph with &lt;b&gt;tags&lt;/b&gt;.</p>');
    expect(html.match(/<p /g)).toHaveLength(2);
  });

  it('preserves single line breaks within a paragraph as <br />', () => {
    const html = paragraphsToHtml('Line one\nLine two');
    expect(html).toContain('Line one<br />Line two');
  });

  it('drops empty paragraphs from extra blank lines', () => {
    const html = paragraphsToHtml('First.\n\n\n\nSecond.');
    expect(html.match(/<p /g)).toHaveLength(2);
  });
});

describe('brandedEmailHtml', () => {
  it('renders the heading and body, escaping the heading', () => {
    const html = brandedEmailHtml({ heading: 'Hi <you>', bodyHtml: '<p>Body</p>' });
    expect(html).toContain('Hi &lt;you&gt;');
    expect(html).toContain('<p>Body</p>');
    expect(html).not.toContain('<a href');
  });

  it('always renders the real logo in the header band, absolute URL', () => {
    const html = brandedEmailHtml({ heading: 'H', bodyHtml: 'B' });
    expect(html).toContain('<img src="https://www.snackquests.shop/logo.png"');
    expect(html).toContain('alt="Snack Quest"');
  });

  it('includes a hero image when given, escaping the URL, alongside (not instead of) the logo', () => {
    const html = brandedEmailHtml({ heading: 'H', bodyHtml: 'B', imageUrl: 'https://example.com/a.png?x=1&y=2' });
    expect(html).toContain('<img src="https://example.com/a.png?x=1&amp;y=2"');
    expect(html.match(/<img /g)).toHaveLength(2);
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

  it('carries no external images beyond the fixed logo and an explicit hero image, and no web fonts or tracking pixels', () => {
    const html = brandedEmailHtml({ heading: 'H', bodyHtml: 'B' });
    expect(html).not.toMatch(/fonts\.googleapis|<link/);
    expect(html.match(/<img /g)).toHaveLength(1);
  });

  it('gives every gradient background a solid background-color fallback for clients that ignore CSS gradients', () => {
    const html = brandedEmailHtml({ heading: 'H', bodyHtml: 'B', ctaLabel: 'Shop', ctaUrl: 'https://example.com' });
    const gradientCount = (html.match(/background:linear-gradient\([^)]*\)/g) ?? []).length;
    const fallbackCount = (html.match(/background-color:#[0-9a-f]{6};background:linear-gradient/g) ?? []).length;
    expect(gradientCount).toBeGreaterThan(0);
    expect(fallbackCount).toBe(gradientCount);
  });

  it('renders up to 3 feature pills, dropping blanks and anything past the third', () => {
    const html = brandedEmailHtml({
      heading: 'H',
      bodyHtml: 'B',
      featurePills: ['🚚 Fast delivery', '', '  ', '🎁 Curated boxes', '💬 24/7 support', '🙅 Never shown'],
    });
    expect(html).toContain('🚚 Fast delivery');
    expect(html).toContain('🎁 Curated boxes');
    expect(html).toContain('💬 24/7 support');
    expect(html).not.toContain('🙅 Never shown');
  });

  it('omits the feature-pill row entirely when no pills are given', () => {
    const html = brandedEmailHtml({ heading: 'H', bodyHtml: 'B' });
    expect(html).not.toContain('🚚');
  });

  it('renders real testimonials with star ratings, escaping customer-authored text', () => {
    const html = brandedEmailHtml({
      heading: 'H',
      bodyHtml: 'B',
      testimonials: [
        { customerName: 'Amina <script>', rating: 4, body: 'Loved it, will buy again!' },
        { customerName: 'Joseph', rating: 5, body: 'Best snacks in Nairobi.' },
      ],
    });
    expect(html).toContain('What people are saying');
    expect(html).toContain('★★★★☆');
    expect(html).toContain('★★★★★');
    expect(html).toContain('Amina &lt;script&gt;');
    expect(html).toContain('Loved it, will buy again!');
    expect(html).toContain('Best snacks in Nairobi.');
  });

  it('caps testimonials at 2 and truncates a long review body', () => {
    const html = brandedEmailHtml({
      heading: 'H',
      bodyHtml: 'B',
      testimonials: [
        { customerName: 'A', rating: 5, body: 'x'.repeat(300) },
        { customerName: 'B', rating: 5, body: 'short' },
        { customerName: 'C', rating: 5, body: 'should not appear' },
      ],
    });
    expect(html).not.toContain('should not appear');
    expect(html).toContain('…');
  });

  it('omits the testimonials section entirely when none are given', () => {
    const html = brandedEmailHtml({ heading: 'H', bodyHtml: 'B' });
    expect(html).not.toContain('What people are saying');
  });
});
