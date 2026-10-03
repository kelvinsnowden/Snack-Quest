import { describe, expect, it } from 'vitest';
import { KIOSK_STATES, MONEY_IN_FLIGHT, adsAllowed, idleTimerRuns, kioskTransition, outcomeOf, type KioskEvent, type KioskState } from '@/lib/kiosk/runtimeMachine';

/** The kiosk runtime state machine (§ KIOSK RUNTIME STATE MACHINE): what may follow what, checked for every state and every event. */

const EVENTS: KioskEvent[] = [
  { type: 'MENU_READY' },
  { type: 'MENU_UNAVAILABLE' },
  { type: 'TOUCH' },
  { type: 'IDLE_TIMEOUT' },
  { type: 'CHECKOUT' },
  { type: 'BACK' },
  { type: 'PAYMENT_REQUESTED' },
  { type: 'PAYMENT_RECEIVED' },
  { type: 'FINISHED', outcome: 'success' },
  { type: 'DONE' },
  { type: 'SERVICE_START' },
  { type: 'SERVICE_END' },
];

function walk(start: KioskState, ...events: KioskEvent[]): KioskState {
  return events.reduce((state, event) => kioskTransition(state, event).state, start);
}

describe('money in flight', () => {
  it('nothing but progress leaves PAYMENT or DISPENSING — no idle, no service mode, no going back', () => {
    for (const state of MONEY_IN_FLIGHT) {
      for (const event of EVENTS) {
        const { state: next, accepted } = kioskTransition(state, event);
        if (!accepted) expect(next).toBe(state);
        if (accepted) expect(['DISPENSING', 'SUCCESS']).toContain(next);
      }
    }
  });

  it('ads never play while money is in flight or the customer is choosing', () => {
    for (const state of KIOSK_STATES) expect(adsAllowed(state)).toBe(state === 'IDLE' || state === 'SUCCESS');
  });

  it('the idle timer runs only while someone could have walked away mid-order', () => {
    expect(KIOSK_STATES.filter(idleTimerRuns)).toEqual(['SHOPPING', 'CHECKOUT']);
  });
});

describe('the happy path and its branches', () => {
  it('boot → menu → checkout → pay → dispense → success → menu → idle → menu', () => {
    const path: [KioskEvent, KioskState][] = [
      [{ type: 'MENU_READY' }, 'SHOPPING'],
      [{ type: 'CHECKOUT' }, 'CHECKOUT'],
      [{ type: 'PAYMENT_REQUESTED' }, 'PAYMENT'],
      [{ type: 'PAYMENT_RECEIVED' }, 'DISPENSING'],
      [{ type: 'FINISHED', outcome: 'success' }, 'SUCCESS'],
      [{ type: 'DONE' }, 'SHOPPING'],
      [{ type: 'IDLE_TIMEOUT' }, 'IDLE'],
      [{ type: 'TOUCH' }, 'SHOPPING'],
    ];
    let state: KioskState = 'BOOTING';
    for (const [event, expected] of path) {
      const result = kioskTransition(state, event);
      expect(result).toEqual({ state: expected, accepted: true });
      state = result.state;
    }
  });

  it('each outcome has its own result screen', () => {
    expect(walk('DISPENSING', { type: 'FINISHED', outcome: 'partial' })).toBe('PARTIAL');
    expect(walk('DISPENSING', { type: 'FINISHED', outcome: 'refund_pending' })).toBe('REFUND_PENDING');
    expect(walk('PAYMENT', { type: 'FINISHED', outcome: 'failed' })).toBe('ERROR');
  });

  it('no menu at all is OFFLINE until one loads', () => {
    expect(walk('BOOTING', { type: 'MENU_UNAVAILABLE' }, { type: 'TOUCH' }, { type: 'CHECKOUT' })).toBe('OFFLINE');
    expect(walk('OFFLINE', { type: 'MENU_READY' })).toBe('SHOPPING');
  });

  it('checkout can go back, or go idle when abandoned', () => {
    expect(walk('CHECKOUT', { type: 'BACK' })).toBe('SHOPPING');
    expect(walk('CHECKOUT', { type: 'IDLE_TIMEOUT' })).toBe('IDLE');
  });
});

describe('service mode', () => {
  it('opens only when nobody is mid-purchase, and closes to the idle screen', () => {
    for (const state of KIOSK_STATES) {
      const { accepted } = kioskTransition(state, { type: 'SERVICE_START' });
      expect(accepted).toBe(['BOOTING', 'OFFLINE', 'IDLE', 'SHOPPING'].includes(state));
    }
    expect(walk('IDLE', { type: 'SERVICE_START' }, { type: 'TOUCH' }, { type: 'IDLE_TIMEOUT' })).toBe('MAINTENANCE');
    expect(walk('MAINTENANCE', { type: 'SERVICE_END' })).toBe('IDLE');
  });
});

describe('outcomeOf', () => {
  it('reads the order’s units', () => {
    expect(outcomeOf(['dispensed', 'dispensed'])).toBe('success');
    expect(outcomeOf(['dispensed', 'paid_vend_failed'])).toBe('partial');
    expect(outcomeOf(['manual_review'])).toBe('refund_pending');
    expect(outcomeOf(['payment_failed', 'payment_failed'])).toBe('failed');
    expect(outcomeOf(['refunded'])).toBe('failed');
    expect(outcomeOf([])).toBe('failed');
  });
});
