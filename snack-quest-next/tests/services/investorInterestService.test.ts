import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import {
  investorInterestService,
  InvestorInterestValidationError,
  InvestorInterestRateLimitError,
} from '@/services/investorInterestService';

/**
 * Expressions of interest from the public `/invest` page
 * (§ investor interest page), against the real emulator.
 *
 * What is worth asserting here is not that a valid form saves — it is
 * everything around that. This endpoint is public, it writes a list of
 * named people with phone numbers, and it will be linked from WhatsApp
 * and TikTok. So: junk is refused, the same person tapping twice does
 * not produce two rows, a script is stopped, and nothing about a
 * submission leaks back to whoever sent it.
 */

const VALID = {
  fullName: 'Wanjiru Kamau',
  email: 'Wanjiru@Example.com',
  phone: '0712345678',
  location: 'Nairobi',
  investorType: 'angel',
};

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('investorInterests'));
});

async function stored(id: string) {
  const doc = await adminFirestore.collection('investorInterests').doc(id).get();
  return doc.data()!;
}

async function count() {
  const snapshot = await adminFirestore.collection('investorInterests').get();
  return snapshot.size;
}

describe('a valid expression of interest', () => {
  it('is stored, normalised, and starts as new', async () => {
    const { interestId, duplicate } = await investorInterestService.submit(VALID);
    const record = await stored(interestId);

    expect(duplicate).toBe(false);
    expect(record.fullName).toBe('Wanjiru Kamau');
    // Lower-cased so the duplicate check catches the same person
    // typing their address with a capital letter the second time.
    expect(record.email).toBe('wanjiru@example.com');
    // E.164, through the same helper the checkout uses.
    expect(record.phone).toBe('254712345678');
    expect(record.status).toBe('new');
  });

  /* Consent is recorded as given or not given, never inferred. */
  it('records no consent to updates unless it was actually given', async () => {
    const { interestId } = await investorInterestService.submit(VALID);
    expect((await stored(interestId)).wantsUpdates).toBe(false);

    await adminFirestore.recursiveDelete(adminFirestore.collection('investorInterests'));
    const second = await investorInterestService.submit({ ...VALID, wantsUpdates: true });
    expect((await stored(second.interestId)).wantsUpdates).toBe(true);
  });

  it('keeps the optional answers when they are given', async () => {
    const { interestId } = await investorInterestService.submit({
      ...VALID,
      indicativeAmount: 'around KSh 500,000',
      motivation: 'I have watched the TikToks.',
      heardFrom: 'TikTok',
    });
    const record = await stored(interestId);

    expect(record.indicativeAmount).toBe('around KSh 500,000');
    expect(record.heardFrom).toBe('TikTok');
  });

  /* Blank optionals are absent, never empty strings in the export. */
  it('stores a missing optional as null rather than an empty string', async () => {
    const { interestId } = await investorInterestService.submit({ ...VALID, motivation: '   ' });
    expect((await stored(interestId)).motivation).toBeNull();
  });
});

describe('what it refuses', () => {
  it.each([
    ['a missing name', { fullName: '' }],
    ['a missing email', { email: '' }],
    ['an email that is not one', { email: 'not-an-email' }],
    ['a phone number that is not Kenyan', { phone: '12345' }],
    ['a missing location', { location: '  ' }],
    ['an investor type that is not on the list', { investorType: 'venture-capital-firm' }],
  ])('refuses %s', async (_label, override) => {
    await expect(
      investorInterestService.submit({ ...VALID, ...override }),
    ).rejects.toBeInstanceOf(InvestorInterestValidationError);
    expect(await count()).toBe(0);
  });

  /* A paste-bomb in a free-text field is a denial-of-service on a human reader. */
  it('refuses an answer nobody could have typed', async () => {
    await expect(
      investorInterestService.submit({ ...VALID, motivation: 'a'.repeat(5_000) }),
    ).rejects.toBeInstanceOf(InvestorInterestValidationError);
  });
});

describe('the same person submitting twice', () => {
  /*
   * A slow network and a second tap. The second submission is answered
   * exactly as the first — from where they stand nothing is different —
   * while the list stays clean.
   */
  it('writes one row and reports the first one back', async () => {
    const first = await investorInterestService.submit(VALID);
    const second = await investorInterestService.submit({ ...VALID, email: 'WANJIRU@example.com' });

    expect(second.duplicate).toBe(true);
    expect(second.interestId).toBe(first.interestId);
    expect(await count()).toBe(1);
  });

  it('treats a different person as a different submission', async () => {
    await investorInterestService.submit(VALID);
    await investorInterestService.submit({ ...VALID, email: 'someone.else@example.com' });

    expect(await count()).toBe(2);
  });
});

describe('rate limiting', () => {
  /*
   * Counted from the stored documents rather than process memory,
   * because this runs on serverless functions: an in-memory tally
   * resets on every cold start, so a script would get past it simply
   * by arriving at a new instance.
   */
  it('stops a burst from one origin', async () => {
    for (let index = 0; index < 5; index += 1) {
      await investorInterestService.submit({
        ...VALID,
        email: `person-${index}@example.com`,
        submitterIp: '196.201.1.1',
      });
    }

    await expect(
      investorInterestService.submit({
        ...VALID,
        email: 'person-6@example.com',
        submitterIp: '196.201.1.1',
      }),
    ).rejects.toBeInstanceOf(InvestorInterestRateLimitError);
  });

  it('does not punish a different origin for it', async () => {
    for (let index = 0; index < 5; index += 1) {
      await investorInterestService.submit({
        ...VALID,
        email: `person-${index}@example.com`,
        submitterIp: '196.201.1.1',
      });
    }

    const other = await investorInterestService.submit({
      ...VALID,
      email: 'elsewhere@example.com',
      submitterIp: '41.90.2.2',
    });
    expect(other.duplicate).toBe(false);
  });

  /*
   * A real investor behind a proxy that strips the address must still
   * be able to reach us — the limit not applying is the correct
   * failure here, not the submission being refused.
   */
  it('accepts a submission with no address to count', async () => {
    const result = await investorInterestService.submit({ ...VALID, submitterIp: undefined });
    expect(result.duplicate).toBe(false);
  });

  /* The raw IP is never written — only a salted hash of it. */
  it('stores no IP address', async () => {
    const { interestId } = await investorInterestService.submit({
      ...VALID,
      submitterIp: '196.201.1.1',
    });
    const record = await stored(interestId);

    expect(JSON.stringify(record)).not.toContain('196.201.1.1');
    expect(record.submitterHash).toMatch(/^[0-9a-f]{32}$/);
  });
});
