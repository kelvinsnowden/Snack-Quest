import { describe, expect, it } from 'vitest';
import { resolveNextStep } from '@/lib/creator/nextStep';

const ACTIVE = {
  accessLevel: 'full' as const,
  status: 'active' as const,
  linkCount: 2,
  totalClicks: 400,
  totalConversions: 12,
  availableCashKes: 0,
};

describe('resolveNextStep', () => {
  it('puts an account block ahead of everything else', () => {
    // A suspended creator with a balance must not be told to withdraw.
    expect(
      resolveNextStep({
        ...ACTIVE,
        accessLevel: 'suspended',
        status: 'suspended',
        availableCashKes: 5000,
      }).id,
    ).toBe('suspended');
  });

  it('tells a pending creator what is happening, and still offers setup', () => {
    const step = resolveNextStep({
      ...ACTIVE,
      accessLevel: 'limited',
      status: 'pending',
      linkCount: 0,
    });
    expect(step.id).toBe('awaiting-approval');
    expect(step.cta?.href).toBe('/creator/referrals');
  });

  it('walks the funnel in order: link, then clicks, then orders', () => {
    expect(resolveNextStep({ ...ACTIVE, linkCount: 0 }).id).toBe(
      'create-first-link',
    );
    expect(resolveNextStep({ ...ACTIVE, totalClicks: 0 }).id).toBe(
      'share-link',
    );
    expect(resolveNextStep({ ...ACTIVE, totalConversions: 0 }).id).toBe(
      'awaiting-first-order',
    );
  });

  it('surfaces a withdrawal only once money is actually available', () => {
    expect(resolveNextStep({ ...ACTIVE, availableCashKes: 2500 }).id).toBe(
      'withdraw',
    );
    expect(resolveNextStep({ ...ACTIVE, availableCashKes: 0 }).id).toBe(
      'keep-sharing',
    );
  });

  it('does not tell a creator with no clicks that people are clicking', () => {
    // Guards the ordering bug where an empty funnel falls through to
    // the "people are clicking" copy.
    const step = resolveNextStep({
      ...ACTIVE,
      totalClicks: 0,
      totalConversions: 0,
    });
    expect(step.id).toBe('share-link');
  });

  it('pluralises the click count in the awaiting-order copy', () => {
    expect(
      resolveNextStep({ ...ACTIVE, totalClicks: 1, totalConversions: 0 }).body,
    ).toContain('1 person has');
    expect(
      resolveNextStep({ ...ACTIVE, totalClicks: 7, totalConversions: 0 }).body,
    ).toContain('7 people have');
  });

  it('always returns exactly one step, never a list', () => {
    const step = resolveNextStep(ACTIVE);
    expect(step.title).toBeTruthy();
    expect(step.body).toBeTruthy();
  });
});
