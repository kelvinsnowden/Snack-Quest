import { describe, expect, it } from 'vitest';
import { classifyDeliveryStatus, parseTextSmsDlr } from '@/lib/integrations/sms/parseTextSmsDlr';

/**
 * TextSMS documents no callback payload (their Postman collection
 * covers only the pull-based `getdlr/`), so these cases pin the
 * parser's *defensive* properties rather than a known contract: alias
 * and casing tolerance on the way in, and a conservative `'pending'`
 * for anything unrecognised on the way out.
 */
describe('parseTextSmsDlr', () => {
  it('reads the shape the send response already uses (lowercase keys, numeric id)', () => {
    expect(parseTextSmsDlr({ messageid: 78726470, status: 'DELIVRD', mobile: '254713482448' })).toEqual({
      providerMessageId: '78726470',
      outcome: 'delivered',
      rawStatus: 'DELIVRD',
      description: null,
      mobile: '254713482448',
    });
  });

  it.each([
    ['messageID', { messageID: '900', dlrstatus: 'DELIVRD' }],
    ['message_id', { message_id: '900', delivery_status: 'DELIVRD' }],
    ['MessageId', { MessageId: '900', DlrStatus: 'DELIVRD' }],
    ['msgid', { msgid: '900', stat: 'DELIVRD' }],
  ])('resolves the message id from the %s alias regardless of casing', (_label, payload) => {
    const report = parseTextSmsDlr(payload);
    expect(report?.providerMessageId).toBe('900');
    expect(report?.outcome).toBe('delivered');
  });

  it('returns null when no message id is present, since there is nothing to correlate', () => {
    expect(parseTextSmsDlr({ status: 'DELIVRD', mobile: '254713482448' })).toBeNull();
    expect(parseTextSmsDlr({})).toBeNull();
  });

  it('ignores blank and non-scalar values rather than treating them as a message id', () => {
    expect(parseTextSmsDlr({ messageid: '   ', status: 'DELIVRD' })).toBeNull();
    expect(parseTextSmsDlr({ messageid: { nested: true }, status: 'DELIVRD' })).toBeNull();
  });

  it('keeps the provider status verbatim, so a wrong mapping guess stays diagnosable', () => {
    expect(parseTextSmsDlr({ messageid: '1', status: 'SomeUndocumentedToken' })).toMatchObject({
      rawStatus: 'SomeUndocumentedToken',
      outcome: 'pending',
    });
  });

  it('picks up a failure description from any of its aliases', () => {
    expect(parseTextSmsDlr({ messageid: '1', status: 'REJECTD', reason: 'Blacklisted number' })?.description).toBe(
      'Blacklisted number',
    );
    expect(
      parseTextSmsDlr({ messageid: '1', status: 'REJECTD', 'response-description': 'Invalid sender' })?.description,
    ).toBe('Invalid sender');
  });
});

describe('classifyDeliveryStatus', () => {
  it.each(['DELIVRD', 'delivrd', 'Delivered', 'success', 'OK', '1'])('treats %s as delivered', (token) => {
    expect(classifyDeliveryStatus(token)).toBe('delivered');
  });

  it.each(['UNDELIV', 'REJECTD', 'EXPIRED', 'failed', 'DELETED', '4', '5'])('treats %s as failed', (token) => {
    expect(classifyDeliveryStatus(token)).toBe('failed');
  });

  it.each(['ACCEPTD', 'ENROUTE', 'BUFFRED', 'submitted', '2', '3', ''])(
    'leaves %s pending rather than guessing',
    (token) => {
      expect(classifyDeliveryStatus(token)).toBe('pending');
    },
  );

  /**
   * SMPP's UNKNOWN means the network could not say. Mapping it to
   * failed would mark genuinely-delivered messages as bounced, so it
   * belongs with pending — this is the case most likely to be "fixed"
   * in the wrong direction later.
   */
  it('leaves UNKNOWN pending, not failed', () => {
    expect(classifyDeliveryStatus('UNKNOWN')).toBe('pending');
  });

  it('leaves a missing status pending', () => {
    expect(classifyDeliveryStatus(null)).toBe('pending');
  });
});
