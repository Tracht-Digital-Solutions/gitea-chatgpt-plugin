import { SafeError } from './errors.js';
export class RateLimiter {
  private buckets = new Map<string, { count: number; reset: number }>();
  private nextSweep = 0;
  constructor(
    private readonly maximum = 120,
    private readonly window = 60000,
  ) {}
  take(key: string): void {
    const now = Date.now();
    if (now >= this.nextSweep) {
      for (const [k, b] of this.buckets)
        if (b.reset <= now) this.buckets.delete(k);
      this.nextSweep = now + this.window;
    }
    let b = this.buckets.get(key);
    if (!b || b.reset <= now) {
      if (!b && this.buckets.size >= 10000)
        throw new SafeError('RATE_LIMITED', 429);
      b = { count: 0, reset: now + this.window };
      this.buckets.set(key, b);
    }
    if (++b.count > this.maximum) throw new SafeError('RATE_LIMITED', 429);
  }
}
