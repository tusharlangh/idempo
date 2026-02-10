import { it, describe, vi, expect, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "./rateLimiter.ts";

describe("ratelimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should allow rate limiting to reach max", async () => {
    const ratelimiter = new RateLimiter(5, 5);

    for (let i = 0; i < 5; i++) {
      await ratelimiter.acquire();
    }

    expect(ratelimiter.getTokens()).toBe(0);
  });

  it("should refill tokens over time", async () => {
    const ratelimiter = new RateLimiter(10, 10);

    for (let i = 0; i < 10; i++) {
      await ratelimiter.acquire();
    }

    expect(ratelimiter.getTokens()).toBe(0);

    vi.advanceTimersByTime(500);

    expect(ratelimiter.getTokens()).toBeCloseTo(5, 0);
  });

  it("should wait for refil", async () => {
    const ratelimiter = new RateLimiter(1, 1);
    await ratelimiter.acquire();

    expect(ratelimiter.getTokens()).toBe(0);

    const acquirepromise = ratelimiter.acquire();

    vi.advanceTimersByTime(1000);

    await acquirepromise;
  });

  it("handles burst traffic by blocking when tokens depleted", async () => {
    const rateLimiter = new RateLimiter(10, 10);

    for (let i = 0; i < 10; i++) {
      await rateLimiter.acquire();
    }
    expect(rateLimiter.getTokens()).toBe(0);

    let acquired = false;
    const acquirePromise = rateLimiter.acquire().then(() => {
      acquired = true;
    });

    expect(acquired).toBe(false);

    vi.advanceTimersByTime(100);
    await acquirePromise;

    expect(acquired).toBe(true);
  });

  it("processes burst requests with proper throttling", async () => {
    const rateLimiter = new RateLimiter(10, 10);
    let completedRequests = 0;

    const requests: Promise<void>[] = [];
    for (let i = 0; i < 20; i++) {
      requests.push(
        rateLimiter.acquire().then(() => {
          completedRequests++;
        }),
      );
    }

    await vi.advanceTimersByTimeAsync(0);
    expect(completedRequests).toBe(10);

    await vi.advanceTimersByTimeAsync(500);
    expect(completedRequests).toBe(15);

    await vi.advanceTimersByTimeAsync(500);
    expect(completedRequests).toBe(20);
  });
});
