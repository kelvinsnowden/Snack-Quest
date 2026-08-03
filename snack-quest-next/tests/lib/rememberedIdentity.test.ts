// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  forgetRememberedCreator,
  getRememberedCreator,
  rememberCreator,
} from '@/lib/creator/rememberedIdentity';

beforeEach(() => {
  window.localStorage.clear();
});

describe('rememberedIdentity', () => {
  it('returns null when nothing has been remembered', () => {
    expect(getRememberedCreator()).toBeNull();
  });

  it('round-trips a remembered identity', () => {
    rememberCreator({ displayName: 'Amina Yusuf', email: 'amina@example.com' });
    expect(getRememberedCreator()).toEqual({
      displayName: 'Amina Yusuf',
      email: 'amina@example.com',
    });
  });

  it('overwrites the previous identity on a new login', () => {
    rememberCreator({ displayName: 'Amina Yusuf', email: 'amina@example.com' });
    rememberCreator({ displayName: 'Brian Otieno', email: 'brian@example.com' });
    expect(getRememberedCreator()).toEqual({
      displayName: 'Brian Otieno',
      email: 'brian@example.com',
    });
  });

  it('clears the remembered identity on forget', () => {
    rememberCreator({ displayName: 'Amina Yusuf', email: 'amina@example.com' });
    forgetRememberedCreator();
    expect(getRememberedCreator()).toBeNull();
  });

  it('ignores malformed stored data rather than throwing', () => {
    window.localStorage.setItem('sq_creator_returning', '{"not":"valid shape"}');
    expect(getRememberedCreator()).toBeNull();

    window.localStorage.setItem('sq_creator_returning', 'not even json');
    expect(getRememberedCreator()).toBeNull();
  });
});
