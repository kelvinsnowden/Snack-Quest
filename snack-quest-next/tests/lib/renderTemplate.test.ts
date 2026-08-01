import { describe, expect, it } from 'vitest';
import { renderTemplate, assertRequiredParams, MissingTemplateParamsError } from '@/lib/notifications/renderTemplate';

describe('renderTemplate', () => {
  it('substitutes every {{token}} present in params', () => {
    expect(renderTemplate('Hi {{name}}, you earned KES {{amount}}', { name: 'Amina', amount: '500' })).toBe(
      'Hi Amina, you earned KES 500',
    );
  });

  it('leaves an unmatched token literally in place rather than throwing', () => {
    expect(renderTemplate('Hi {{name}}, {{unknown}}', { name: 'Amina' })).toBe('Hi Amina, {{unknown}}');
  });

  it('is a no-op on a template with no tokens', () => {
    expect(renderTemplate('Plain text', {})).toBe('Plain text');
  });
});

describe('assertRequiredParams', () => {
  it('passes when every required param is present', () => {
    expect(() => assertRequiredParams('tpl', ['name', 'amount'], { name: 'Amina', amount: '500' })).not.toThrow();
  });

  it('throws MissingTemplateParamsError listing every missing key', () => {
    expect(() => assertRequiredParams('tpl', ['name', 'amount'], { name: 'Amina' })).toThrow(
      MissingTemplateParamsError,
    );
    try {
      assertRequiredParams('tpl', ['name', 'amount'], {});
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(MissingTemplateParamsError);
      expect((error as Error).message).toContain('name');
      expect((error as Error).message).toContain('amount');
    }
  });
});
