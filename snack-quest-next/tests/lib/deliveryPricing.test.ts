import { describe, expect, it } from 'vitest';
import {
  matchesMetroTown,
  metroAreaLabel,
  metroTowns,
  allFargoZones,
  availableServiceLevels,
  FARGO_SEED_FEES_KES,
  fargoZoneFor,
  isFargoZone,
  deliveryMethodForRegion,
  isCustomerFacingPickupPoint,
  isSameDayAvailableAt,
  isExpressAvailableAt,
  expressWindowStateAt,
  EXPRESS_OPEN_HOUR,
  EXPRESS_CUTOFF_HOUR,
  SAME_DAY_CUTOFF_HOUR,
} from '@/lib/delivery/deliveryPricing';

/**
 * Fargo's rate card (§ Jumia to Fargo migration).
 *
 * The figures the business negotiated, asserted here so a later edit
 * to the seed table is a deliberate act rather than a typo nobody
 * notices until a customer is charged the wrong amount.
 */

describe('the rate card', () => {
  it('prices the three services the business actually buys', () => {
    expect(FARGO_SEED_FEES_KES).toEqual({
      'Nairobi Metro — Next Day': 250,
      'Nairobi Metro — Same Day': 300,
      'Nairobi Metro — Express': 500,
      Upcountry: 450,
    });
  });

  it('routes each region and speed to its zone', () => {
    expect(fargoZoneFor('nairobi-metro', 'next-day')).toBe('Nairobi Metro — Next Day');
    expect(fargoZoneFor('nairobi-metro', 'same-day')).toBe('Nairobi Metro — Same Day');
    expect(fargoZoneFor('nairobi-metro', 'express')).toBe('Nairobi Metro — Express');
    expect(fargoZoneFor('upcountry', 'next-day')).toBe('Upcountry');
  });

  /** Fargo runs no same-day service beyond the metro, so asking for it upcountry prices as the only service that exists rather than matching no rule at all. */
  it('falls back to the single upcountry service when same-day is asked for out of range', () => {
    expect(fargoZoneFor('upcountry', 'same-day')).toBe('Upcountry');
  });

  /** Express is a 90-minute city run; there is no upcountry version of it, so it prices as the only service that reaches there. */
  it('falls back to the single upcountry service when express is asked for out of range', () => {
    expect(fargoZoneFor('upcountry', 'express')).toBe('Upcountry');
  });

  /*
   * Four zones from six region-and-speed combinations: upcountry has
   * no same-day and no express, so both collapse onto the one service
   * that actually reaches there. Asserted as a deduplicated list
   * because a stray fifth zone would mean a rule nobody priced.
   */
  it('exposes four distinct zones, not six', () => {
    expect(allFargoZones().sort()).toEqual([
      'Nairobi Metro — Express',
      'Nairobi Metro — Next Day',
      'Nairobi Metro — Same Day',
      'Upcountry',
    ]);
  });
});

describe('isFargoZone', () => {
  it.each(allFargoZones())('accepts %s', (zone) => {
    expect(isFargoZone(zone)).toBe(true);
  });

  /**
   * The gate exists because its Jumia predecessor did: a station with
   * no priceable zone has an unknown cost, and selling it is how every
   * pickup order ended up shipping free.
   */
  it.each([null, undefined, '', 'Zone 1', 'Nairobi', 'nairobi-metro'])('refuses %s', (value) => {
    expect(isFargoZone(value as string | null | undefined)).toBe(false);
  });
});

describe('the same-day cut-off', () => {
  /** 09:00 in Nairobi, expressed as the UTC instant it corresponds to (EAT is UTC+3, no DST). */
  const nairobi = (hour: number, minute = 0) =>
    new Date(Date.UTC(2026, 7, 20, hour - 3, minute));

  it('is open before 13:00 Nairobi time', () => {
    expect(isSameDayAvailableAt(nairobi(9))).toBe(true);
    expect(isSameDayAvailableAt(nairobi(12, 59))).toBe(true);
  });

  it('is closed from 13:00 onward', () => {
    expect(isSameDayAvailableAt(nairobi(13))).toBe(false);
    expect(isSameDayAvailableAt(nairobi(16))).toBe(false);
  });

  /**
   * The reason this is evaluated in Nairobi time rather than the
   * runtime's. These functions run in Cape Town, an hour behind, so a
   * naive local-hour check would keep same-day on sale until 14:00
   * Nairobi — selling a 6pm guarantee the courier had already stopped
   * accepting.
   */
  it('uses Nairobi time, not the server time zone', () => {
    // 13:30 in Nairobi is 12:30 in Cape Town. A local-hour check would
    // read 12 and wrongly call this available.
    const justAfterCutoff = new Date(Date.UTC(2026, 7, 20, 10, 30));
    expect(isSameDayAvailableAt(justAfterCutoff)).toBe(false);
  });

  it('states the cut-off once, so copy and logic cannot drift', () => {
    expect(SAME_DAY_CUTOFF_HOUR).toBe(13);
  });
});

describe('the express window', () => {
  const nairobi = (hour: number, minute = 0) => new Date(Date.UTC(2026, 7, 20, hour - 3, minute));

  /*
   * Express is a window, not a cut-off, and the opening bound is the
   * one a cut-off-only check silently loses: it would put a 90-minute
   * promise on sale at 03:00, to be delivered by a rider who starts at
   * ten.
   */
  it('is closed before it opens', () => {
    expect(isExpressAvailableAt(nairobi(3))).toBe(false);
    expect(isExpressAvailableAt(nairobi(9, 59))).toBe(false);
  });

  it('is open from 10:00 until 13:00 Nairobi time', () => {
    expect(isExpressAvailableAt(nairobi(10))).toBe(true);
    expect(isExpressAvailableAt(nairobi(12, 59))).toBe(true);
  });

  it('is closed from 13:00 onward', () => {
    expect(isExpressAvailableAt(nairobi(13))).toBe(false);
    expect(isExpressAvailableAt(nairobi(20))).toBe(false);
  });

  /*
   * Nairobi time matters at both ends here, and the trap runs in
   * opposite directions. The runtime is an hour behind, so a naive
   * local-hour check would refuse express at 10:30 Nairobi (reading 9)
   * and still sell it at 13:30 (reading 12).
   */
  it('uses Nairobi time at both bounds, not the server time zone', () => {
    expect(isExpressAvailableAt(new Date(Date.UTC(2026, 7, 20, 7, 30)))).toBe(true); // 10:30 EAT
    expect(isExpressAvailableAt(new Date(Date.UTC(2026, 7, 20, 10, 30)))).toBe(false); // 13:30 EAT
  });

  it('states both bounds once, so copy and logic cannot drift', () => {
    expect(EXPRESS_OPEN_HOUR).toBe(10);
    expect(EXPRESS_CUTOFF_HOUR).toBe(13);
  });

  /*
   * The checkout needs more than a boolean: "closed for today" is
   * simply wrong at breakfast, when express opens in two hours.
   */
  it('reports which side of the window the clock is on', () => {
    expect(expressWindowStateAt(nairobi(8))).toBe('before');
    expect(expressWindowStateAt(nairobi(11))).toBe('open');
    expect(expressWindowStateAt(nairobi(15))).toBe('after');
  });
});

describe('availableServiceLevels', () => {
  /* 08:00 UTC is 11:00 Nairobi: inside every window. */
  it('offers all three speeds in the metro inside the express window', () => {
    expect(availableServiceLevels('nairobi-metro', new Date(Date.UTC(2026, 7, 20, 8)))).toEqual([
      'next-day',
      'same-day',
      'express',
    ]);
  });

  /*
   * 06:00 UTC is 09:00 Nairobi. Same-day is fine that early — it only
   * has a deadline — but express has not opened, which is the whole
   * difference between the two rules.
   */
  it('withholds express before it opens while same-day is still fine', () => {
    expect(availableServiceLevels('nairobi-metro', new Date(Date.UTC(2026, 7, 20, 6)))).toEqual([
      'next-day',
      'same-day',
    ]);
  });

  /* 12:00 UTC is 15:00 Nairobi: both metro speeds share the 13:00 deadline, so both are gone. */
  it('drops same-day and express together at 13:00', () => {
    expect(availableServiceLevels('nairobi-metro', new Date(Date.UTC(2026, 7, 20, 12)))).toEqual(['next-day']);
  });

  /** Upcountry has one speed at any hour — the windows are irrelevant there, and offering a choice would be inventing a service. */
  it.each([6, 8, 12])('offers only next-day upcountry, regardless of the hour (%s UTC)', (hour) => {
    expect(availableServiceLevels('upcountry', new Date(Date.UTC(2026, 7, 20, hour)))).toEqual(['next-day']);
  });
});

describe('the region decides the delivery model, not just the price', () => {
  /**
   * The correction that matters most here. Inside the radius the parcel
   * comes to the door and the customer types an address; outside it,
   * they pick a branch. An earlier pass treated every Fargo location as
   * a pickup point, which would have shown Nairobi customers a list of
   * 35 branches they are never meant to visit.
   */
  it('sends the metro to the door and everywhere else to a branch', () => {
    expect(deliveryMethodForRegion('nairobi-metro')).toBe('door');
    expect(deliveryMethodForRegion('upcountry')).toBe('pickup');
  });

  it('only ever offers a pickup point outside the radius', () => {
    expect(isCustomerFacingPickupPoint('nairobi-metro')).toBe(false);
    expect(isCustomerFacingPickupPoint('upcountry')).toBe(true);
  });
});

/**
 * A real customer in Thika could not find a Fargo station and had to
 * ask support how to order. There is none: Thika is inside the radius,
 * so it gets door delivery. The site had only ever said "Nairobi",
 * which told them they were not covered.
 */
describe('telling a customer which towns get door delivery', () => {
  it('names every town rather than saying "and surrounding areas"', () => {
    const label = metroAreaLabel();

    for (const town of metroTowns()) {
      expect(label).toContain(town);
    }
    // Nairobi anchors it — the name everyone recognises.
    expect(label.startsWith('Nairobi')).toBe(true);
  });

  it('recognises a door-delivery town typed into the pickup search', () => {
    expect(matchesMetroTown('Thika')).toBe('Thika');
    expect(matchesMetroTown('  kitengela ')).toBe('Kitengela');
    expect(matchesMetroTown('LIMURU')).toBe('Limuru');
  });

  it('stays quiet for a town that really does need a pickup point', () => {
    expect(matchesMetroTown('Mombasa')).toBeNull();
    expect(matchesMetroTown('Kisumu')).toBeNull();
    expect(matchesMetroTown('')).toBeNull();
  });
});
