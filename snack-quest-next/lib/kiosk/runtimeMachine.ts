/**
 * The customer screen's runtime state machine (§ KIOSK RUNTIME STATE
 * MACHINE, § IDLE STATE MACHINE). Every screen change goes through
 * `kioskTransition`: a transition not in the table is refused and the
 * state stays as it was, so the screen can never, for example, go idle,
 * show an ad or open service mode while a customer's money is in flight.
 * Pure — no timers, no I/O — so it is tested exhaustively on its own.
 */

export const KIOSK_STATES = ['BOOTING', 'OFFLINE', 'IDLE', 'SHOPPING', 'CHECKOUT', 'PAYMENT', 'DISPENSING', 'SUCCESS', 'PARTIAL', 'ERROR', 'REFUND_PENDING', 'MAINTENANCE'] as const;
export type KioskState = (typeof KIOSK_STATES)[number];

export type KioskOutcome = 'success' | 'partial' | 'failed' | 'refund_pending';

export type KioskEvent =
  /** The menu loaded (from the network or the cache). */
  | { type: 'MENU_READY' }
  /** No menu at all — neither the network nor a cached copy. */
  | { type: 'MENU_UNAVAILABLE' }
  /** Someone touched the idle screen. */
  | { type: 'TOUCH' }
  /** Nobody has touched the screen for the idle timeout. */
  | { type: 'IDLE_TIMEOUT' }
  | { type: 'CHECKOUT' }
  | { type: 'BACK' }
  /** The payment request was accepted and the customer is entering their PIN. */
  | { type: 'PAYMENT_REQUESTED' }
  /** The payment cleared and the machine is dispensing. */
  | { type: 'PAYMENT_RECEIVED' }
  /** Every unit in the order reached a final outcome. */
  | { type: 'FINISHED'; outcome: KioskOutcome }
  /** The result has been read (timeout or "Back to menu"). */
  | { type: 'DONE' }
  | { type: 'SERVICE_START' }
  | { type: 'SERVICE_END' };

export type KioskEventType = KioskEvent['type'];

const RESULT_STATE: Record<KioskOutcome, KioskState> = { success: 'SUCCESS', partial: 'PARTIAL', failed: 'ERROR', refund_pending: 'REFUND_PENDING' };

/** States in which a customer's money may be in flight: nothing may interrupt them. */
export const MONEY_IN_FLIGHT: readonly KioskState[] = ['PAYMENT', 'DISPENSING'];

/** States showing a result to the customer who just paid. */
export const RESULT_STATES: readonly KioskState[] = ['SUCCESS', 'PARTIAL', 'ERROR', 'REFUND_PENDING'];

/** Service mode may start only when nobody is mid-purchase. */
const SERVICEABLE: readonly KioskState[] = ['BOOTING', 'OFFLINE', 'IDLE', 'SHOPPING'];

const TABLE: Record<KioskState, Partial<Record<KioskEventType, KioskState | ((event: KioskEvent) => KioskState)>>> = {
  BOOTING: { MENU_READY: 'SHOPPING', MENU_UNAVAILABLE: 'OFFLINE' },
  OFFLINE: { MENU_READY: 'SHOPPING' },
  IDLE: { TOUCH: 'SHOPPING', MENU_UNAVAILABLE: 'OFFLINE' },
  SHOPPING: { IDLE_TIMEOUT: 'IDLE', CHECKOUT: 'CHECKOUT' },
  CHECKOUT: { BACK: 'SHOPPING', IDLE_TIMEOUT: 'IDLE', PAYMENT_REQUESTED: 'PAYMENT' },
  PAYMENT: { PAYMENT_RECEIVED: 'DISPENSING', FINISHED: (event) => RESULT_STATE[(event as Extract<KioskEvent, { type: 'FINISHED' }>).outcome] },
  DISPENSING: { FINISHED: (event) => RESULT_STATE[(event as Extract<KioskEvent, { type: 'FINISHED' }>).outcome] },
  SUCCESS: { DONE: 'SHOPPING' },
  PARTIAL: { DONE: 'SHOPPING' },
  ERROR: { DONE: 'SHOPPING' },
  REFUND_PENDING: { DONE: 'SHOPPING' },
  MAINTENANCE: { SERVICE_END: 'IDLE' },
};

export interface KioskTransition {
  state: KioskState;
  /** False when the event isn't allowed from the current state; `state` is then unchanged. */
  accepted: boolean;
}

export function kioskTransition(state: KioskState, event: KioskEvent): KioskTransition {
  if (event.type === 'SERVICE_START') {
    return SERVICEABLE.includes(state) ? { state: 'MAINTENANCE', accepted: true } : { state, accepted: false };
  }
  const next = TABLE[state][event.type];
  if (next === undefined) return { state, accepted: false };
  return { state: typeof next === 'function' ? next(event) : next, accepted: true };
}

/** A `useReducer` reducer over `kioskTransition`. */
export function kioskReducer(state: KioskState, event: KioskEvent): KioskState {
  return kioskTransition(state, event).state;
}

/** Ads play only on the idle screen and on a success screen — never while someone is choosing, paying, being refunded, or in service mode. */
export function adsAllowed(state: KioskState): boolean {
  return state === 'IDLE' || state === 'SUCCESS';
}

/** Whether the idle timer may run: only while someone could be browsing and has walked away. */
export function idleTimerRuns(state: KioskState): boolean {
  return state === 'SHOPPING' || state === 'CHECKOUT';
}

/** The final outcome of an order from each unit's own status. */
export function outcomeOf(statuses: string[]): KioskOutcome {
  const dispensed = statuses.filter((status) => status === 'dispensed').length;
  if (dispensed === statuses.length && statuses.length > 0) return 'success';
  if (dispensed > 0) return 'partial';
  if (statuses.some((status) => status === 'paid_vend_failed' || status === 'manual_review' || status === 'refund_requested')) return 'refund_pending';
  return 'failed';
}
