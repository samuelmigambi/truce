import "server-only";

/**
 * An append-only log of a run's events that any number of readers can follow. A run writes to it
 * from wherever its work happens (a tool, a parallel call); each reader gets every event from the
 * start, in order, then waits for more. So a browser that reconnects mid-run catches up, and the
 * run carries on and saves its result even if nobody is reading.
 */
export class EventLog<T> {
  private readonly items: { at: number; event: T }[] = [];
  private waiters: (() => void)[] = [];
  private closed = false;
  private readonly started: number;

  constructor(private readonly clock: () => number = Date.now) {
    this.started = clock();
  }

  push(event: T): void {
    if (this.closed) return;
    this.items.push({ at: this.clock() - this.started, event });
    this.wake();
  }

  close(): void {
    this.closed = true;
    this.wake();
  }

  get done(): boolean {
    return this.closed;
  }

  /** How many events so far. */
  get size(): number {
    return this.items.length;
  }

  /** Milliseconds since the log was opened. */
  elapsed(): number {
    return this.clock() - this.started;
  }

  /** Every event so far, with its time in milliseconds from the start of the run. */
  timeline(): { at: number; event: T }[] {
    return [...this.items];
  }

  async *read(signal?: AbortSignal): AsyncGenerator<T> {
    let next = 0;
    for (;;) {
      while (next < this.items.length) yield this.items[next++]!.event;
      if (this.closed || signal?.aborted) return;
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        signal?.addEventListener("abort", () => resolve(), { once: true });
      });
    }
  }

  private wake() {
    const waiting = this.waiters;
    this.waiters = [];
    for (const resolve of waiting) resolve();
  }
}

/**
 * A fixed number of slots, handed out first come, first served. Live analyses take one each, so
 * a visitor opening every case at once queues them instead of crowding Token Factory.
 */
export class Slots {
  private waiting: (() => void)[] = [];

  constructor(private free: number) {}

  /** True when a slot is free right now. */
  get open(): boolean {
    return this.free > 0;
  }

  /** Runs ahead in the queue. */
  get queued(): number {
    return this.waiting.length;
  }

  async take(): Promise<void> {
    if (this.free > 0) {
      this.free--;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  give(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.free++;
  }
}

/** A signal that fires when any of `signals` does, or after `ms`. */
export function deadline(ms: number, ...signals: (AbortSignal | undefined)[]): AbortSignal {
  return AbortSignal.any([
    AbortSignal.timeout(ms),
    ...signals.filter((s): s is AbortSignal => !!s),
  ]);
}
