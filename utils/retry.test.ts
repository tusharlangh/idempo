import { it, describe, vi, expect } from "vitest";
import { Retry } from "./retry.ts";

describe("check retry on valid functions", () => {
  it("returns true", async () => {
    const retry = new Retry();
    const mockedFn = vi.fn().mockResolvedValue("success");

    const { result, error_details } = await retry.retry(mockedFn, 3);

    expect(result).toBe("success");
    expect(error_details.flag).toBe("SUCCESS");
    expect(mockedFn).toHaveBeenCalledTimes(1);
  });

  it("should fail but suceed after retries", async () => {
    const retry = new Retry();
    const mockedFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail #1"))
      .mockRejectedValueOnce(new Error("fail #2"))
      .mockResolvedValue("success");

    const { result, error_details } = await retry.retry(mockedFn, 3);

    expect(result).toBe("success");
    expect(error_details.flag).toBe("SUCCESS");
    expect(mockedFn).toHaveBeenCalledTimes(3);
  });

  it("should fail for all ", async () => {
    const retry = new Retry();
    const mockedFn = vi.fn().mockRejectedValue(new Error("Complete failure"));

    const { result, error_details } = await retry.retry(mockedFn, 3);

    expect(result).toBeUndefined();
    expect(error_details.flag).toBe("FAILURE");
    expect(error_details.retry_attempts).toHaveLength(4);
    expect(mockedFn).toHaveBeenCalledTimes(4);
  });

  it("should record error details for each attempt", async () => {
    const retry = new Retry();
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("error 1"))
      .mockRejectedValueOnce(new Error("error 2"))
      .mockResolvedValue("success");
    const { error_details } = await retry.retry(mockFn, 3);
    expect(error_details.retry_attempts).toHaveLength(2);
    expect(error_details.retry_attempts[0]!.error).toBe("error 1");
    expect(error_details.retry_attempts[1]!.error).toBe("error 2");
  });

  it("should verify backoff timing between attempts", async () => {
    const retry = new Retry();
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("error 1"))
      .mockRejectedValueOnce(new Error("error 2"))
      .mockRejectedValueOnce(new Error("error 3"))
      .mockResolvedValue("success");

    const { error_details } = await retry.retry(mockFn, 3);

    expect(error_details.retry_attempts).toHaveLength(3);

    const attempt1 = error_details.retry_attempts[0]!.timestamp;
    const attempt2 = error_details.retry_attempts[1]!.timestamp;
    const attempt3 = error_details.retry_attempts[2]!.timestamp;

    const delay1to2 =
      new Date(attempt2).getTime() - new Date(attempt1).getTime();
    const delay2to3 =
      new Date(attempt3).getTime() - new Date(attempt2).getTime();

    console.log(`Delay between attempt 1 and 2: ${delay1to2}ms`);
    console.log(`Delay between attempt 2 and 3: ${delay2to3}ms`);

    expect(delay1to2).toBeGreaterThanOrEqual(95);
    expect(delay1to2).toBeLessThan(200);

    expect(delay2to3).toBeGreaterThanOrEqual(195);
    expect(delay2to3).toBeLessThan(300);

    expect(delay2to3).toBeGreaterThan(delay1to2);
  });

  it("should pass attempt number to callback function", async () => {
    const retry = new Retry();
    const receivedAttempts: number[] = [];

    const mockFn = vi.fn((attempt: number) => {
      receivedAttempts.push(attempt);

      if (receivedAttempts.length < 3) {
        throw new Error(`error on attempt ${attempt}`);
      }
      return "success";
    });

    const { result, error_details } = await retry.retry(mockFn, 3);

    expect(receivedAttempts).toEqual([1, 2, 3]);

    expect(mockFn).toHaveBeenNthCalledWith(1, 1);
    expect(mockFn).toHaveBeenNthCalledWith(2, 2);
    expect(mockFn).toHaveBeenNthCalledWith(3, 3);

    expect(result).toBe("success");
    expect(error_details.flag).toBe("SUCCESS");
    console.log("Received attempts:", receivedAttempts);
  });
});
