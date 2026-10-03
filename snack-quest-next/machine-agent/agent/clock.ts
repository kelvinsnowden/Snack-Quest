/** Time as the agent sees it — injectable so tests and the fake board run in virtual time, never really waiting. */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** Virtual time: `sleep` moves the clock forward instead of waiting. */
export class FakeClock implements Clock {
  constructor(private time = Date.parse('2026-01-01T08:00:00Z')) {}
  now(): number {
    return this.time;
  }
  async sleep(ms: number): Promise<void> {
    this.time += Math.max(0, ms);
  }
  advance(ms: number): void {
    this.time += ms;
  }
}
