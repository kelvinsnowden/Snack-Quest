/**
 * How many SMS segments a message will actually be billed as.
 *
 * Worth having as real code rather than a rule of thumb, because the
 * cliff is invisible in a compose box and expensive at volume. A
 * message is billed per segment, not per message: 160 characters is one
 * segment, 161 is two. And a single character outside the GSM 03.38
 * alphabet — one emoji, one curly quote pasted from a document — forces
 * the whole message into UCS-2, where a segment is 70 characters
 * instead of 160. A 150-character message costs one segment; the same
 * message with a 🎉 on the end costs three.
 *
 * Concatenated messages are smaller per segment than a single one (153
 * and 67 rather than 160 and 70) because each part gives up room to a
 * header saying how the parts reassemble.
 */

const GSM7_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
);

/** These exist in GSM-7 only via an escape byte, so each one costs two characters, not one. */
const GSM7_EXTENDED = new Set('^{}\\[~]|€');

export type SmsEncoding = 'GSM-7' | 'UCS-2';

export interface SmsCost {
  encoding: SmsEncoding;
  /** Billable character count — not `body.length`, which ignores both the escape cost of GSM-7 extended characters and UTF-16 surrogate pairs. */
  characters: number;
  segments: number;
  /** How many more characters fit before the next segment starts costing money. */
  charactersUntilNextSegment: number;
  /** The character that forced UCS-2, when one did — so the composer can say "the 🎉 is what tripled this" rather than just showing a bigger number. */
  forcedUcs2By: string | null;
}

const GSM7_SINGLE = 160;
const GSM7_CONCATENATED = 153;
const UCS2_SINGLE = 70;
const UCS2_CONCATENATED = 67;

function isGsm7(char: string): boolean {
  return GSM7_BASIC.has(char) || GSM7_EXTENDED.has(char);
}

/**
 * Iterates by code point, not by `string.length`. An emoji is two UTF-16
 * code units, and treating it as two characters would report the wrong
 * culprit to the composer even though the UCS-2 total happens to match.
 */
export function calculateSmsCost(body: string): SmsCost {
  const characters = Array.from(body ?? '');

  const offender = characters.find((char) => !isGsm7(char)) ?? null;

  if (offender === null) {
    const length = characters.reduce((total, char) => total + (GSM7_EXTENDED.has(char) ? 2 : 1), 0);
    const segments = length <= GSM7_SINGLE ? Math.max(1, Math.ceil(length / GSM7_SINGLE)) : Math.ceil(length / GSM7_CONCATENATED);
    const capacity = segments === 1 ? GSM7_SINGLE : segments * GSM7_CONCATENATED;
    return {
      encoding: 'GSM-7',
      characters: length,
      segments,
      charactersUntilNextSegment: capacity - length,
      forcedUcs2By: null,
    };
  }

  // UCS-2 bills per UTF-16 code unit, so an emoji really does cost two.
  const length = (body ?? '').length;
  const segments = length <= UCS2_SINGLE ? Math.max(1, Math.ceil(length / UCS2_SINGLE)) : Math.ceil(length / UCS2_CONCATENATED);
  const capacity = segments === 1 ? UCS2_SINGLE : segments * UCS2_CONCATENATED;
  return {
    encoding: 'UCS-2',
    characters: length,
    segments,
    charactersUntilNextSegment: capacity - length,
    forcedUcs2By: offender,
  };
}

/** Total billable segments for a whole campaign — the number that actually multiplies by the per-segment rate. */
export function campaignSegmentTotal(body: string, recipientCount: number): number {
  return calculateSmsCost(body).segments * recipientCount;
}
