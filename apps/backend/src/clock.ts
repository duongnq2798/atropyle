/** Wall time in milliseconds (budgets, leases, rate-limit windows, *_at columns). Chain time comes from blocks. */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface FakeClock extends Clock {
  advance(ms: number): void;
  set(ms: number): void;
}

/** A clock for tests: it only moves when told to, and sleep() moves it instead of waiting. */
export function fakeClock(startMs = Date.UTC(2026, 10, 23, 12, 0, 0)): FakeClock {
  let t = startMs;
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
    advance: (ms) => {
      t += ms;
    },
    set: (ms) => {
      t = ms;
    },
  };
}

export const isoAt = (ms: number): string => new Date(ms).toISOString();
